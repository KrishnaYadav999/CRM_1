const mongoose = require('mongoose');

const QuotationPiboCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 100 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('QuotationPiboCategory', QuotationPiboCategorySchema);
