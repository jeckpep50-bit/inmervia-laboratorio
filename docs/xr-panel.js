function textLines(ctx, text, x, y, width, lineHeight, maxLines) {
  let line = '',
    row = 0;
  for (const word of text.split(' ')) {
    const next = line + word + ' ';
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line.trim(), x, y + row * lineHeight);
      row++;
      line = '';
      if (row >= maxLines) return;
    }
    line += word + ' ';
  }
  if (row < maxLines) ctx.fillText(line.trim(), x, y + row * lineHeight);
}
export function paintXRPanel(canvas, view, actions, tabs) {
  const ctx = canvas.getContext('2d'),
    buttons = [];
  ctx.fillStyle = '#fcf9fc';
  ctx.fillRect(0, 0, 1024, 1190);
  ctx.fillStyle = '#511d4c';
  ctx.fillRect(0, 0, 1024, 135);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px Arial';
  ctx.fillText('INMERVIA · ' + view.animal, 40, 61);
  ctx.font = '27px Arial';
  ctx.fillText(view.subtitle, 40, 106);
  ctx.fillStyle = '#511d4c';
  ctx.font = 'bold 35px Arial';
  textLines(ctx, view.heading, 40, 190, 940, 41, 2);
  ctx.fillStyle = '#4d4250';
  ctx.font = '27px Arial';
  textLines(ctx, view.body, 40, 277, 940, 35, 3);
  ctx.fillStyle = '#176d72';
  ctx.font = 'bold 25px Arial';
  textLines(ctx, view.status, 40, 396, 940, 30, 1);
  function button(label, action, x, y, w, h, active = false) {
    ctx.fillStyle = active ? '#511d4c' : '#e8f4f5';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = active ? '#fff' : '#511d4c';
    ctx.font = 'bold 27px Arial';
    if (ctx.measureText(label).width > w - 28) {
      ctx.font = 'bold 24px Arial';
      textLines(ctx, label, x + 14, y + 26, w - 28, 26, 2);
    } else ctx.fillText(label, x + 14, y + h * 0.64);
    buttons.push({ x, y, w, h, action });
  }
  tabs.forEach((tab, index) =>
    button(tab.label, tab.action, 25 + index * 326, 438, 310, 66, tab.active),
  );
  actions
    .slice(0, 14)
    .forEach(([label, action], index) =>
      button(label, action, 30 + (index % 2) * 492, 535 + Math.floor(index / 2) * 99, 470, 83),
    );
  ctx.fillStyle = '#6b5b6b';
  ctx.font = '23px Arial';
  ctx.fillText(view.footer || 'Gatillo: seleccionar · Agarre: mover y girar piezas', 35, 1110);
  ctx.fillText('Superficie externa · Movimientos ilustrativos', 35, 1149);
  ctx.fillText('Botón B/Y: acercar el panel', 35, 1181);
  return buttons;
}
