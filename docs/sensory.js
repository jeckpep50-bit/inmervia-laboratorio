export function pulse(controller, strength = 0.25, duration = 35) {
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
