const params = new URLSearchParams(window.location.search);
const url = params.get('url');
document.getElementById('blocked-url').textContent = url || 'Unknown site';
