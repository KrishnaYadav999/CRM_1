# PO (Purchase Order) Data Fetch - Complete Guide

## Overview
The PO (Purchase Order) data is stored within the **Lead** model, not as a separate collection. Each Lead contains PO information in the `poYearRows` array. This is similar to how Client Master data extends from the Lead model.

---

## Data Structure

### PO Fields in Lead Model
```javascript
{
  poStatus: String,              // 'received' or 'provisional'
  poApprovalStatus: String,      // 'PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'
  poYearRows: [
    {
      fy: String,                // Financial Year (e.g., "2024-25")
      poNumber: String,          // PO Number
      poAmount: Number,          // PO Amount in INR
      poFileUrl: String,         // URL to uploaded PO file
      poFileName: String,        // Original filename
      services: [String],        // Array of service names
      quotationId: String,       // Reference to Quotation._id
      quotationNumber: String,   // Quotation number
      quotationItems: Array,     // Quotation line items
      quotationCreatedById: String,    // User ID who created quotation
      quotationCreatedByEmail: String  // Email of quotation creator
    }
  ]
}
```

---

## API Endpoints

### 1. Fetch All Leads (with PO data)
```
GET /leads
Returns: Array of Lead objects with poYearRows array
```

### 2. Fetch Single Lead with PO Details
```
GET /leads/:leadId
Returns: Single Lead object with complete PO information
```

### 3. Update PO Approval Status
```
PATCH /leads/purchase-order-approvals/:approvalId
Body: {
  status: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED',
  remarks: String,
  screenshotUrl: String (optional)
}
Returns: Updated approval status
```

---

## Frontend Implementation

### 1. API Service (services/api.js)
```javascript
// Add this to your API service

// Fetch leads with PO data
export const fetchLeadsWithPO = async (filters = {}) => {
  const response = await api.get(API_ENDPOINTS.leads.list, { params: filters });
  return response.data.filter(lead => lead.poYearRows && lead.poYearRows.length > 0);
};

// Fetch single lead PO details
export const fetchLeadPODetails = async (leadId) => {
  const response = await api.get(API_ENDPOINTS.leads.detail(leadId));
  return {
    leadId: response.data._id,
    leadCode: response.data.leadCode,
    company: response.data.company,
    poStatus: response.data.poStatus,
    poApprovalStatus: response.data.poApprovalStatus,
    poYearRows: response.data.poYearRows || []
  };
};

// Update PO approval
export const updatePOApprovalStatus = async (approvalId, status, remarks = '') => {
  const response = await api.patch(
    API_ENDPOINTS.leads.purchaseOrderApprovalDecision(approvalId),
    { status, remarks }
  );
  return response.data;
};
```

### 2. React Component - PO Data Display
```javascript
import { useEffect, useState } from 'react';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';

function PODataView() {
  const [poData, setPOData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPOData = async () => {
      setLoading(true);
      try {
        const response = await api.get(API_ENDPOINTS.leads.list);
        
        // Filter leads that have PO data
        const leadsWithPO = response.data
          .filter(lead => lead.poYearRows && lead.poYearRows.length > 0)
          .map(lead => ({
            leadId: lead._id,
            leadCode: lead.leadCode,
            company: lead.company,
            poStatus: lead.poStatus,
            poApprovalStatus: lead.poApprovalStatus,
            poYearRows: lead.poYearRows,
            poCount: lead.poYearRows.length
          }));
        
        setPOData(leadsWithPO);
      } catch (err) {
        setError(err?.response?.data?.error || 'Unable to fetch PO data');
      } finally {
        setLoading(false);
      }
    };

    fetchPOData();
  }, []);

  if (loading) return <div>Loading PO data...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Purchase Order Data</h2>
      
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Lead Code</th>
            <th className="border p-2">Company</th>
            <th className="border p-2">PO Status</th>
            <th className="border p-2">Approval Status</th>
            <th className="border p-2">F.Y</th>
            <th className="border p-2">PO Number</th>
            <th className="border p-2">PO Amount (₹)</th>
            <th className="border p-2">Services</th>
          </tr>
        </thead>
        <tbody>
          {poData.map(lead =>
            lead.poYearRows.map((po, idx) => (
              <tr key={`${lead.leadId}-${idx}`}>
                <td className="border p-2">{lead.leadCode}</td>
                <td className="border p-2">{lead.company}</td>
                <td className="border p-2">
                  <span className={`px-2 py-1 rounded ${
                    lead.poStatus === 'received' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {lead.poStatus}
                  </span>
                </td>
                <td className="border p-2">
                  <span className={`px-2 py-1 rounded ${
                    lead.poApprovalStatus === 'APPROVED'
                      ? 'bg-green-100 text-green-800'
                      : lead.poApprovalStatus === 'REJECTED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {lead.poApprovalStatus}
                  </span>
                </td>
                <td className="border p-2">{po.fy}</td>
                <td className="border p-2">{po.poNumber}</td>
                <td className="border p-2">₹{Number(po.poAmount).toLocaleString('en-IN')}</td>
                <td className="border p-2 text-sm">{(po.services || []).join(', ')}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {poData.length === 0 && (
        <p className="text-gray-500 text-center mt-4">No PO data found</p>
      )}
    </div>
  );
}

export default PODataView;
```

### 3. Integration in Your Projects

**Project 1: Frontend (sales/lead-generation page)**
```javascript
// In your lead-generation page component
import { useEffect, useState } from 'react';
import api from '../services/api';

function LeadGenerationWithPO() {
  const [selectedLead, setSelectedLead] = useState(null);
  const [poDetails, setPODetails] = useState(null);

  const loadPODetails = async (leadId) => {
    try {
      const response = await api.get(`/leads/${leadId}`);
      setPODetails({
        poYearRows: response.data.poYearRows || [],
        poStatus: response.data.poStatus,
        poApprovalStatus: response.data.poApprovalStatus
      });
    } catch (err) {
      console.error('Failed to load PO details:', err);
    }
  };

  return (
    <div>
      {/* Your existing lead selection UI */}
      {selectedLead && poDetails && (
        <div className="mt-6 p-4 border rounded">
          <h3 className="text-lg font-bold mb-4">Purchase Orders</h3>
          {poDetails.poYearRows.length > 0 ? (
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border p-2">F.Y</th>
                  <th className="border p-2">PO Number</th>
                  <th className="border p-2">Amount</th>
                  <th className="border p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {poDetails.poYearRows.map((po, idx) => (
                  <tr key={idx}>
                    <td className="border p-2">{po.fy}</td>
                    <td className="border p-2">{po.poNumber}</td>
                    <td className="border p-2">₹{Number(po.poAmount).toLocaleString('en-IN')}</td>
                    <td className="border p-2">
                      <a href={po.poFileUrl} target="_blank" rel="noopener noreferrer" 
                         className="text-blue-600 underline">
                        View Document
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500">No PO data available for this lead</p>
          )}
        </div>
      )}
    </div>
  );
}

export default LeadGenerationWithPO;
```

---

## Backend Implementation (if needed)

### Create Dedicated PO Service (services/poDataService.js)
```javascript
const Lead = require('../models/Lead');

// Get all leads with PO data
exports.getLeadsWithPOData = async (filters = {}) => {
  return Lead.find({
    poYearRows: { $exists: true, $ne: [] }
  })
    .select('_id leadCode company poStatus poApprovalStatus poYearRows')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
};

// Get specific lead PO details
exports.getLeadPODetails = async (leadId) => {
  const lead = await Lead.findById(leadId)
    .select('_id leadCode company poStatus poApprovalStatus poYearRows')
    .lean();
  
  if (!lead) throw new Error('Lead not found');
  return lead;
};

// Get PO statistics
exports.getPOStatistics = async () => {
  const stats = await Lead.aggregate([
    { $match: { poYearRows: { $exists: true, $ne: [] } } },
    {
      $group: {
        _id: null,
        totalLeadsWithPO: { $sum: 1 },
        totalPOs: { $sum: { $size: '$poYearRows' } },
        receivedCount: {
          $sum: { $cond: [{ $eq: ['$poStatus', 'received'] }, 1, 0] }
        },
        provisionalCount: {
          $sum: { $cond: [{ $eq: ['$poStatus', 'provisional'] }, 1, 0] }
        },
        approvedCount: {
          $sum: { $cond: [{ $eq: ['$poApprovalStatus', 'APPROVED'] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$poApprovalStatus', 'PENDING'] }, 1, 0] }
        },
        rejectedCount: {
          $sum: { $cond: [{ $eq: ['$poApprovalStatus', 'REJECTED'] }, 1, 0] }
        },
        totalAmount: {
          $sum: { $sum: '$poYearRows.poAmount' }
        }
      }
    }
  ]);

  return stats[0] || {
    totalLeadsWithPO: 0,
    totalPOs: 0,
    receivedCount: 0,
    provisionalCount: 0,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    totalAmount: 0
  };
};
```

---

## Export PO Data to Excel

```javascript
import * as XLSX from 'xlsx';

export const exportPODataToExcel = (poData) => {
  const worksheet = XLSX.utils.json_to_sheet(
    poData.flatMap(lead =>
      lead.poYearRows.map(po => ({
        'Lead Code': lead.leadCode,
        'Company': lead.company,
        'F.Y': po.fy,
        'PO Number': po.poNumber,
        'PO Amount': po.poAmount,
        'Services': po.services.join('; '),
        'Quotation Number': po.quotationNumber,
        'PO Status': lead.poStatus,
        'Approval Status': lead.poApprovalStatus,
        'Download Link': po.poFileUrl
      }))
    )
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'PO Data');
  XLSX.writeFile(workbook, `PO_Data_${new Date().toISOString().split('T')[0]}.xlsx`);
};
```

---

## Database Query Examples

### Find all leads with received POs
```javascript
db.leads.find({
  poStatus: 'received',
  'poYearRows': { $exists: true, $ne: [] }
})
```

### Find leads with pending PO approvals
```javascript
db.leads.find({
  poApprovalStatus: 'PENDING',
  'poYearRows': { $exists: true, $ne: [] }
})
```

### Get total PO amounts by financial year
```javascript
db.leads.aggregate([
  { $match: { 'poYearRows': { $exists: true } } },
  { $unwind: '$poYearRows' },
  {
    $group: {
      _id: '$poYearRows.fy',
      totalAmount: { $sum: '$poYearRows.poAmount' },
      count: { $sum: 1 }
    }
  },
  { $sort: { _id: 1 } }
])
```

---

## Key Differences: Client Master vs PO Data

| Aspect | Client Master | PO Data |
|--------|---------------|---------|
| Storage | Separate `Client` collection | Part of `Lead` model |
| Access | `/clients` endpoints | `/leads` endpoints |
| Structure | `Client.data` (dynamic fields) | `Lead.poYearRows` (array) |
| Per Lead | One per lead | Multiple per lead (array) |
| Approval | Via Client approval workflow | Via `/purchase-order-approvals` |

---

## Testing

```bash
# Test endpoint in Postman/Thunder Client
GET {{baseURL}}/leads?poStatus=received

# Get specific lead PO data
GET {{baseURL}}/leads/{{leadId}}

# Update PO approval
PATCH {{baseURL}}/leads/purchase-order-approvals/{{approvalId}}
{
  "status": "APPROVED",
  "remarks": "PO approved after review"
}
```

---

## Common Issues & Solutions

### Issue 1: PO data not showing
**Solution:** Ensure the lead has `poStatus` set to 'received' or 'provisional' and `poYearRows` is not empty.

### Issue 2: poYearRows is undefined
**Solution:** Use optional chaining: `lead.poYearRows?.map()` or provide default: `lead.poYearRows || []`

### Issue 3: PO file URL returns 404
**Solution:** Check that the file was successfully uploaded to storage (AWS S3 or similar) and URL is valid.

---

## Performance Optimization

For large datasets, use pagination and lean queries:

```javascript
// Paginated fetch
const page = 1;
const limit = 50;
const skip = (page - 1) * limit;

const leadsWithPO = await Lead.find({ poYearRows: { $ne: [] } })
  .skip(skip)
  .limit(limit)
  .lean();
```
