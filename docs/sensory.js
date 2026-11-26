import * as THREE from 'three';

export class SensoryFeedback {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.nodes = new Set();
  }
  unlock() {
    if (!this.enabled) return false;
    try {
      if (!this.listener) {
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
      }
      if (this.listener.context.state === 'suspended')
        this.listener.context.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  pulse(controller, strength = 0.25, duration = 35) {
    const gamepad = controller?.userData.inputSource?.gamepad;
    const actuator = gamepad?.hapticActuators?.[0] || gamepad?.vibrationActuator;
    try {
      const result =
        typeof actuator?.pulse === 'function'
          ? actuator.pulse(strength, duration)
          : actuator?.playEffect?.('dual-rumble', {
              duration,
              strongMagnitude: strength,
              weakMagnitude: strength,
            });
      result?.catch?.(() => {});
    } catch {}
  }
  play(kind, position, controller) {
    this.pulse(controller, kind === 'snap' ? 0.4 : 0.18, kind === 'snap' ? 65 : 25);
    if (!this.unlock()) return;
    const context = this.listener.context,
      duration = kind === 'snap' ? 0.18 : 0.1;
    const buffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * duration),
        context.sampleRate,
      ),
      values = buffer.getChannelData(0);
    const frequency = kind === 'snap' ? 880 : kind === 'wrong' ? 210 : 530;
    for (let i = 0; i < values.length; i++) {
      const t = i / context.sampleRate,
        attack = Math.min(1, t / 0.006),
        decay = Math.exp(-t / (duration * 0.25));
      values[i] = Math.sin(2 * Math.PI * frequency * t) * attack * decay * 0.22;
    }
    const node = new THREE.PositionalAudio(this.listener);
    node.setBuffer(buffer);
    node.setRefDistance(1);
    node.setRolloffFactor(0.8);
    node.setMaxDistance(8);
    node.setVolume(0.22);
    if (position) node.position.copy(position);
    this.scene.add(node);
    this.nodes.add(node);
    node.onEnded = () => {
      node.isPlaying = false;
      node.disconnect();
      node.removeFromParent();
      this.nodes.delete(node);
    };
    node.play();
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      for (const node of this.nodes) {
        if (node.isPlaying) node.stop();
        node.removeFromParent();
      }
      this.nodes.clear();
    }
    return this.enabled;
  }
  speak(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-EC';
    utterance.rate = 0.93;
    const voice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('es'));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return true;
  }
  dispose() {
    for (const node of this.nodes) {
      if (node.isPlaying) node.stop();
      node.disconnect();
      node.removeFromParent();
    }
    this.nodes.clear();
    if (this.listener) {
      this.listener.removeFromParent();
      this.listener.gain.disconnect();
    }
    window.speechSynthesis?.cancel();
  }
}
