// In-memory stand-in for DynamoDB that understands exactly the calls Atomic's clerks make
// (Put with the three conditions they use, Get, Delete, and Query by pk with an optional sk prefix and syncedAt filter).
// It also refuses unused expression values, which the real DynamoDB rejects.
export function fakeDdb() {
  const rows = new Map(); // `${pk}|${sk}` -> item
  const failed = () => { const e = new Error('The conditional request failed'); e.name = 'ConditionalCheckFailedException'; return e; };
  return {
    rows,
    async send(cmd) {
      const i = cmd.input, name = cmd.constructor.name, V = i.ExpressionAttributeValues || {};
      const text = [i.KeyConditionExpression, i.FilterExpression, i.ConditionExpression].filter(Boolean).join(' ');
      for (const k of Object.keys(V)) if (!text.includes(k)) throw new Error('fake ddb: unused expression value ' + k);
      if (name === 'PutCommand') {
        const key = `${i.Item.pk}|${i.Item.sk}`, cur = rows.get(key), cond = i.ConditionExpression || '';
        if (cond) {
          let ok;
          if (cond === 'version = :v') ok = !!cur && cur.version === V[':v'];
          else if (cond === 'attribute_not_exists(pk)') ok = !cur;
          else if (cond === 'attribute_not_exists(sk) OR updatedAt < :u') ok = !cur || cur.updatedAt < V[':u'];
          else throw new Error('fake ddb: unsupported condition ' + cond);
          if (!ok) throw failed();
        }
        rows.set(key, structuredClone(i.Item)); return {};
      }
      if (name === 'GetCommand') { const r = rows.get(`${i.Key.pk}|${i.Key.sk}`); return r ? { Item: structuredClone(r) } : {}; }
      if (name === 'DeleteCommand') { rows.delete(`${i.Key.pk}|${i.Key.sk}`); return {}; }
      if (name === 'QueryCommand') {
        const pk = V[':pk'], prefix = V[':p'], since = V[':since'];
        const Items = [...rows.values()].filter(r => r.pk === pk && (!prefix || r.sk.startsWith(prefix)) && (!since || r.syncedAt > since)).map(r => structuredClone(r));
        return { Items };
      }
      throw new Error('fake ddb: unsupported ' + name);
    },
  };
}
