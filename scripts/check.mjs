const base = `http://localhost:${process.env.PORT || 8791}`;

const response = await fetch(`${base}/api/health`).catch((error) => {
  throw new Error(`Server is not reachable at ${base}: ${error.message}`);
});

if (!response.ok) {
  throw new Error(`Health check failed with ${response.status}`);
}

const data = await response.json();
console.log(`Luulu Friend & Companion is healthy: ${data.status}`);
