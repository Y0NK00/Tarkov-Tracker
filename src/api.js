// Central API helper
async function tarkovGQL(query) {
  console.log('API CALL:', query.slice(0,80).replace(/\s+/g,' '));
  let result;
  if (window.electronAPI && window.electronAPI.graphql) {
    result = await window.electronAPI.graphql(query);
  } else {
    const r = await fetch('https://api.tarkov.dev/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    result = await r.json();
  }
  if (result && result.error) throw new Error('IPC: ' + result.error);
  if (result && result.errors) {
    const msg = result.errors[0].message;
    console.error('GQL ERROR:', msg, '\nQuery:', query.slice(0,200));
    throw new Error('GraphQL: ' + msg);
  }
  if (!result || !result.data) {
    console.error('BAD RESPONSE:', JSON.stringify(result).slice(0,300));
    throw new Error('Bad response: ' + JSON.stringify(result).slice(0,100));
  }
  console.log('API OK, keys:', Object.keys(result.data));
  return result;
}
