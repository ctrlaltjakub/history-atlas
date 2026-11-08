// Load the same donation panel used by Ko-fi's overlay only when requested.
const supportButton = document.querySelector('#kofi-support');
const supportDialog = document.querySelector('#kofi-dialog');
const supportFrame = document.querySelector('#kofi-frame');

supportButton.addEventListener('click', () => {
  if (!supportFrame.getAttribute('src')) supportFrame.src = supportFrame.dataset.src;
  supportDialog.showModal();
  document.body.classList.add('modal-open');
});

document.querySelector('#kofi-close').addEventListener('click', () => supportDialog.close());
supportDialog.addEventListener('click', event => {
  if (event.target !== supportDialog) return;
  const rect = supportDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) supportDialog.close();
});
supportDialog.addEventListener('close', () => {
  if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
  supportButton.focus({preventScroll:true});
});
