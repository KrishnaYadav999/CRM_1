const mongoose = require('mongoose');
const Quotation = require('../models/Quotation');

mongoose.set('bufferCommands', false);

async function ensureQuotationIndexes() {
  const collection = mongoose.connection.collection('quotations');
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return;
    throw err;
  }
  const legacyGlobalIndex = indexes.find((index) => (
    index.unique === true
    && Object.keys(index.key || {}).length === 1
    && index.key?.quotationNumber === 1
  ));
  if (legacyGlobalIndex) {
    await collection.dropIndex(legacyGlobalIndex.name);
    console.log('Removed legacy global quotation-number index');
  }
  await Quotation.createIndexes();
}

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/registerd_types';
    await mongoose.connect(uri, {
      dbName: process.env.DB_NAME || 'registerd_types',
      serverSelectionTimeoutMS: 10000
    });
    await ensureQuotationIndexes();
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error', err);
    throw err;
  }
};

module.exports = connectDB;
