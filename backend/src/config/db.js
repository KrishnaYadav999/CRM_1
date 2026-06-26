const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/registerd_types';
    await mongoose.connect(uri, { dbName: process.env.DB_NAME || 'registerd_types' });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error', err);
    throw err;
  }
};

module.exports = connectDB;
