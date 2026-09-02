const test = require('node:test');
const assert = require('node:assert/strict');

const Client = require('../src/models/Client');

test('Client schema retains service allocations in strict-mode updates', () => {
  const serviceKey = 'importer::eprplastic::importer::202324';
  const userId = '6a732bedffe6621c1d81394a';
  const update = Client.castObject({
    serviceAllocations: {
      [serviceKey]: {
        userId,
        userIdString: userId,
        assignedByName: 'Tushar Gawas',
        assignedUserRole: 'manager'
      }
    }
  });

  assert.deepEqual(update.serviceAllocations, {
    [serviceKey]: {
      userId,
      userIdString: userId,
      assignedByName: 'Tushar Gawas',
      assignedUserRole: 'manager'
    }
  });
});

test('Client documents serialize saved service allocations for the frontend', () => {
  const serviceKey = 'importer::eprplastic::importer::202324';
  const userId = '6a732bedffe6621c1d81394a';
  const client = new Client({
    serviceAllocations: {
      [serviceKey]: { userId, assignedByName: 'Tushar Gawas' }
    }
  });

  const serialized = client.toObject();
  assert.equal(serialized.serviceAllocations[serviceKey].userId, userId);
  assert.equal(serialized.serviceAllocations[serviceKey].assignedByName, 'Tushar Gawas');
});
