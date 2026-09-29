// In-memory stand-in for DynamoDB that understands exactly the two calls Atomic's data clerk makes.
export function fakeDdb() {
  const rows = new Map(); // `${pk}|${sk}` -> item
  return {
    rows,
    async send(cmd) {
      const i = cmd.input, name = cmd.constructor.name;
      if (name === 'PutCommand') {
        const key = `${i.Item.pk}|${i.Item.sk}`, cur = rows.get(key);
        if (cur && !(cur.updatedAt < i.ExpressionAttributeValues[':u'])) {
          const e = new Error('The conditional request failed'); e.name = 'ConditionalCheckFailedException'; throw e;
        }
        rows.set(key, structuredClone(i.Item)); return {};
      }
      if (name === 'QueryCommand') {
        const pk = i.ExpressionAttributeValues[':pk'], since = i.ExpressionAttributeValues[':since'];
        const Items = [...rows.values()].filter(r => r.pk === pk && (!since || r.syncedAt > since)).map(r => structuredClone(r));
        return { Items };
      }
      throw new Error('fake ddb: unsupported ' + name);
    },
  };
}
