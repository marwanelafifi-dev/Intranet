const realFetch = globalThis.fetch;
const members = JSON.parse(process.env.SIWARE_TEST_GROUP_MEMBERS_JSON || '{}');
const groupStatuses = JSON.parse(process.env.SIWARE_TEST_GROUP_STATUS_JSON || '{}');

globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
    return new Response(JSON.stringify({ access_token:'test-group-token', expires_in:3600 }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  if (url.hostname === 'admin.googleapis.com' && url.pathname.includes('/hasMember/')) {
    const [, group, member] = /^\/admin\/directory\/v1\/groups\/([^/]+)\/hasMember\/([^/]+)$/.exec(url.pathname) || [];
    const status = groupStatuses[decodeURIComponent(group)];
    if (status) return new Response(JSON.stringify({ error:{ code:status } }), { status, headers:{ 'content-type':'application/json' } });
    return new Response(JSON.stringify({ isMember:Array.isArray(members[decodeURIComponent(group)]) && members[decodeURIComponent(group)].includes(decodeURIComponent(member)) }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  return realFetch(input, options);
};
