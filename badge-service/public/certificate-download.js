(() => {
  'use strict';
  // Keep the capability out of HTTP request URLs, access logs, and referrers.
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const button = document.querySelector('#download'), status = document.querySelector('#status');
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) { button.disabled = true; status.textContent = 'This certificate link is missing or invalid. Open the original link from your email.'; }
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = 'Preparing your certificate…';
    try {
      const response = await fetch('/api/badges/certificate-download', { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Certificate is unavailable. Contact Continuing Education.');
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data.data),c=>c.charCodeAt(0))],{type:'application/pdf'}));
      const a = document.createElement('a'); a.href = url; a.download = data.filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent = 'Certificate downloaded.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
})();
