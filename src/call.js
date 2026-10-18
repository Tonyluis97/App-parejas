// Llamada de voz entre los dos móviles con WebRTC.
// La señal (oferta, respuesta y candidatos) viaja por Sync en signal/call y en la colección cand.
(function () {
  'use strict';

  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ].concat(window.TURN_SERVERS || []);

  const Call = {
    state: 'idle',        // idle | calling | ringing | active
    muted: false,
    onchange: null,
    _pc: null, _stream: null, _id: null, _seen: new Set(), _queue: [], _code: null, _uid: null, _offs: [], _sig: null,

    start(code, uid) {
      this.stop();
      this._code = code; this._uid = uid;
      this._offs.push(Sync.watch(code, 'signal', list => this._onSignal(list.find(d => d.id === 'call'))));
      this._offs.push(Sync.watch(code, 'cand', list => this._onCands(list)));
    },
    stop() { this._offs.forEach(f => f && f()); this._offs = []; this._cleanup(); },

    _emit() { try { this.onchange && this.onchange(this.state); } catch (e) { console.error(e); } },

    async _media() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador no permite usar el micrófono.');
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    },

    _newPc() {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      pc.onicecandidate = e => {
        if (e.candidate && this._id) Sync.add(this._code, 'cand', { callId: this._id, from: this._uid, c: e.candidate.toJSON(), t: Date.now() });
      };
      pc.ontrack = e => {
        const a = document.getElementById('remoteAudio');
        if (a) { a.srcObject = e.streams[0]; a.play && a.play().catch(() => { }); }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { this.state = 'active'; this._emit(); }
        if (pc.connectionState === 'failed') { this.hangup(); }
      };
      return pc;
    },

    async call() {
      if (this.state !== 'idle') return;
      this._stream = await this._media();
      this._id = 'c' + Date.now().toString(36);
      this._pc = this._newPc();
      this._stream.getTracks().forEach(t => this._pc.addTrack(t, this._stream));
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      this.state = 'calling'; this._emit();
      await Sync.set(this._code, 'signal', 'call', { callId: this._id, from: this._uid, offer: { type: offer.type, sdp: offer.sdp }, answer: null, st: 'ringing', t: Date.now() });
    },

    async accept() {
      const s = this._sig;
      if (!s || s.st !== 'ringing' || s.from === this._uid) return;
      this._id = s.callId;
      this._stream = await this._media();
      this._pc = this._newPc();
      this._stream.getTracks().forEach(t => this._pc.addTrack(t, this._stream));
      await this._pc.setRemoteDescription(s.offer);
      const ans = await this._pc.createAnswer();
      await this._pc.setLocalDescription(ans);
      this._flush();
      this.state = 'active'; this._emit();
      await Sync.set(this._code, 'signal', 'call', { answer: { type: ans.type, sdp: ans.sdp }, st: 'active', t: Date.now() }, true);
    },

    async hangup() {
      const had = this._id;
      this._cleanup();
      this.state = 'idle'; this._emit();
      if (had && this._code) await Sync.set(this._code, 'signal', 'call', { st: 'ended', t: Date.now() }, true);
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this._stream) this._stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
      this._emit();
    },

    _cleanup() {
      if (this._pc) { try { this._pc.close(); } catch (e) { } }
      if (this._stream) this._stream.getTracks().forEach(t => t.stop());
      this._pc = null; this._stream = null; this._id = null; this._queue = []; this.muted = false;
      const a = document.getElementById('remoteAudio');
      if (a) a.srcObject = null;
    },

    async _onSignal(s) {
      this._sig = s || null;
      if (!s) return;
      const fresh = Date.now() - (s.t || 0) < 60000;
      if (s.st === 'ringing' && s.from !== this._uid && this.state === 'idle' && fresh) {
        this.state = 'ringing'; this._emit();
      } else if (s.st === 'active' && s.from === this._uid && this._pc && s.answer && !this._pc.currentRemoteDescription) {
        await this._pc.setRemoteDescription(s.answer);
        this._flush();
      } else if (s.st === 'ended' && this.state !== 'idle') {
        this._cleanup(); this.state = 'idle'; this._emit();
      }
    },

    _onCands(list) {
      for (const d of list) {
        if (this._seen.has(d.id) || d.from === this._uid || !this._id || d.callId !== this._id) continue;
        this._seen.add(d.id);
        this._queue.push(d.c);
      }
      this._flush();
    },

    _flush() {
      if (!this._pc || !this._pc.remoteDescription) return;
      while (this._queue.length) this._pc.addIceCandidate(this._queue.shift()).catch(e => console.warn(e));
    },
  };

  window.Call = Call;
})();
