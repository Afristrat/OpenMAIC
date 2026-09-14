const invoke = window.__TAURI__.core.invoke;
const deviceResult = document.querySelector('#device-result');
const packageResult = document.querySelector('#package-result');

document.querySelector('#create-device').addEventListener('click', async () => {
  try {
    const identity = await invoke('create_device_identity');
    deviceResult.textContent = `Appareil : ${identity.deviceId}\nClé de chiffrement : ${identity.encryptionPublicKey}`;
    document.querySelector('[name="deviceId"]').value = identity.deviceId;
  } catch {
    deviceResult.textContent = 'Impossible de créer cet appareil sécurisé.';
  }
});

document.querySelector('#open-package').addEventListener('submit', async (event) => {
  event.preventDefault();
  packageResult.textContent = '';
  const fields = new FormData(event.currentTarget);
  try {
    const opened = await invoke('open_local_package', {
      request: Object.fromEntries(fields),
    });
    packageResult.textContent = JSON.stringify(opened.content, null, 2);
  } catch {
    packageResult.textContent = 'Accès au paquet refusé.';
  }
});
