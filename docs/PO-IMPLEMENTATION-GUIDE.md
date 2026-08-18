# Implementation Guide - Fetch PO Data in Both Projects

## Quick Start: Step-by-Step Implementation

### STEP 1: Add API Endpoint (Backend)

**File:** `backend/src/routes/leads.js`

```javascript
// Add this route alongside existing routes
router.get('/purchase-orders', requireAuth, leadCtrl.listPurchaseOrderData);
```

**File:** `backend/src/controllers/leadController.js`

```javascript
// Add this function to leadController
exports.listPurchaseOrderData = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (page - 1) * limit;

    const query = { poYearRows: { $exists: true, $ne: [] } };
    if (status) query.poStatus = status;

    const total = await Lead.countDocuments(query);
    const data = await Lead.find(query)
      .select('_id leadCode company poStatus poApprovalStatus poYearRows createdAt')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch PO data: ' + error.message });
  }
};
```

---

### STEP 2: Update API Endpoints (Frontend)

**File:** `frontend/src/services/apiEndpoints.js`

```javascript
// Add to the leads section:
leads: {
  // ... existing endpoints ...
  list: '/leads',
  purchaseOrders: '/leads/purchase-orders',  // Add this
  detail: (id) => `/leads/${encodePathValue(id)}`,
  purchaseOrderApprovalDecision: (id) => `/leads/purchase-order-approvals/${encodePathValue(id)}`,
}
```

---

### STEP 3: Create PO Fetch Service (Frontend)

**File:** `frontend/src/services/poService.js` (CREATE NEW FILE)

```javascript
import api from './api';
import { API_ENDPOINTS } from './apiEndpoints';

export const poService = {
  // Fetch all PO data with pagination
  fetchAllPOData: async (page = 1, limit = 50, filters = {}) => {
    try {
      const params = {
        page,
        limit,
        ...filters
      };
      const response = await api.get(API_ENDPOINTS.leads.purchaseOrders, { params });
      return response.data;
    } catch (error) {
      throw {
        message: error?.response?.data?.error || 'Failed to fetch PO data',
        status: error?.response?.status,
        details: error
      };
    }
  },

  // Fetch single lead's PO details
  fetchLeadPODetails: async (leadId) => {
    try {
      const response = await api.get(API_ENDPOINTS.leads.detail(leadId));
      return {
        leadId: response.data._id,
        leadCode: response.data.leadCode,
        company: response.data.company,
        poStatus: response.data.poStatus,
        poApprovalStatus: response.data.poApprovalStatus,
        poYearRows: response.data.poYearRows || [],
        createdBy: response.data.createdBy,
        createdAt: response.data.createdAt
      };
    } catch (error) {
      throw {
        message: error?.response?.data?.error || 'Failed to fetch lead PO details',
        status: error?.response?.status,
        details: error
      };
    }
  },

  // Update PO approval status
  updatePOApproval: async (approvalId, status, remarks = '', screenshotUrl = '') => {
    try {
      const response = await api.patch(
        API_ENDPOINTS.leads.purchaseOrderApprovalDecision(approvalId),
        {
          status,
          remarks,
          screenshotUrl
        }
      );
      return response.data;
    } catch (error) {
      throw {
        message: error?.response?.data?.error || 'Failed to update PO approval',
        status: error?.response?.status,
        details: error
      };
    }
  },

  // Download PO file
  downloadPOFile: (poFileUrl, fileName) => {
    if (!poFileUrl) {
      throw new Error('PO file URL not available');
    }
    const link = document.createElement('a');
    link.href = poFileUrl;
    link.download = fileName || 'PO_Document';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Format PO amount for display
  formatAmount: (amount) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })}`;
  },

  // Get status badge class
  getStatusClass: (status) => {
    const classes = {
      'received': 'bg-green-100 text-green-800',
      'provisional': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800',
      'PENDING': 'bg-orange-100 text-orange-800',
      'REVISION_REQUIRED': 'bg-blue-100 text-blue-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }
};
```

---

### STEP 4: Create PO Component (Frontend)

**File:** `frontend/src/components/PurchaseOrderTable.jsx` (CREATE NEW FILE)

```javascript
import React, { useEffect, useState } from 'react';
import { Download, Eye, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { poService } from '../services/poService';
import ToastMessage from './ToastMessage';

function PurchaseOrderTable() {
  const [poData, setPOData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selectedStatus, setSelectedStatus] = useState('');
  const [toast, setToast] = useState(null);

  const loadPOData = async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const result = await poService.fetchAllPOData(pageNum, 50, {
        status: selectedStatus || undefined
      });
      setPOData(result.data);
      setPagination(result.pagination);
      setPage(pageNum);
    } catch (err) {
      setError(err.message || 'Failed to load PO data');
      setToast({
        type: 'error',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPOData(1);
  }, [selectedStatus]);

  const handleDownload = (poFileUrl, poNumber) => {
    try {
      poService.downloadPOFile(poFileUrl, `PO_${poNumber}.pdf`);
    } catch (err) {
      setToast({
        type: 'error',
        message: 'Unable to download file'
      });
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'REJECTED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'PENDING':
        return <Clock className="h-4 w-4 text-orange-600" />;
      default:
        return null;
    }
  };

  if (loading && poData.length === 0) {
    return <div className="p-4 text-center text-gray-600">Loading PO data...</div>;
  }

  return (
    <div className="w-full">
      {toast && (
        <ToastMessage
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All PO Status</option>
          <option value="received">Received</option>
          <option value="provisional">Provisional</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Lead Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Company</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">F.Y</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">PO Number</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Approval</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {poData.length > 0 ? (
              poData.flatMap(lead =>
                lead.poYearRows.map((po, idx) => (
                  <tr key={`${lead._id}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-900">{lead.leadCode}</td>
                    <td className="px-4 py-3 text-gray-700">{lead.company}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{po.fy}</td>
                    <td className="px-4 py-3 font-mono text-gray-900">{po.poNumber}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {poService.formatAmount(po.poAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${poService.getStatusClass(lead.poStatus)}`}>
                        {lead.poStatus === 'received' ? '✓ Received' : '⏳ Provisional'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${poService.getStatusClass(lead.poApprovalStatus)}`}>
                        {getStatusIcon(lead.poApprovalStatus)}
                        {lead.poApprovalStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        {po.poFileUrl && (
                          <button
                            onClick={() => handleDownload(po.poFileUrl, po.poNumber)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Download PO"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )
            ) : (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  No PO data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => loadPOData(page - 1)}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {page} of {pagination.pages}
          </span>
          <button
            onClick={() => loadPOData(page + 1)}
            disabled={page === pagination.pages}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default PurchaseOrderTable;
```

---

### STEP 5: Integrate into Your Pages

**File:** `frontend/src/pages/LeadGeneration.jsx` or similar

```javascript
// Add imports
import PurchaseOrderTable from '../components/PurchaseOrderTable';

// Add to your page component
function LeadGenerationPage() {
  return (
    <div>
      {/* Existing content */}
      
      {/* Add PO Section */}
      <section className="mt-8 border-t pt-8">
        <h2 className="text-2xl font-bold mb-6">Purchase Orders</h2>
        <PurchaseOrderTable />
      </section>
    </div>
  );
}
```

---

## Comparison: Client Master vs PO Fetch

### Client Master Fetch Pattern
```javascript
// GET /clients
// Returns: Client collection with all fields
// Data stored in separate Collection
```

### PO Fetch Pattern
```javascript
// GET /leads/purchase-orders (or /leads with filter)
// Returns: Lead documents containing poYearRows array
// Data stored within Lead document
```

---

## Database Indexes (Optional - For Performance)

**File:** `backend/src/models/Lead.js`

```javascript
// Add these indexes to LeadSchema:
LeadSchema.index({ poStatus: 1 });
LeadSchema.index({ poApprovalStatus: 1 });
LeadSchema.index({ 'poYearRows.fy': 1 });
LeadSchema.index({ 'poYearRows.poNumber': 1 });
```

---

## Testing Checklist

- [ ] Backend route `/leads/purchase-orders` returns data
- [ ] Pagination works correctly
- [ ] Filter by `poStatus` works
- [ ] Frontend component displays PO table
- [ ] Download button works for PO files
- [ ] Approval status shows correctly
- [ ] Amount formatting is correct (₹ symbol)
- [ ] No console errors

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| poYearRows is empty | Ensure leads have PO data created |
| 404 on API endpoint | Check route is added correctly |
| File download fails | Verify file URL is valid and file exists |
| Pagination not working | Ensure pagination params are passed |
| Slow queries | Add database indexes on poStatus and poApprovalStatus |

---

## Environment Variables (if needed)

```bash
# .env
VITE_PO_EXPORT_ENABLED=true
VITE_PO_PAGE_LIMIT=50
```

---

## Next Steps

1. ✅ Add backend route
2. ✅ Add API endpoint definition
3. ✅ Create PO service
4. ✅ Create UI component
5. ✅ Integrate into pages
6. ✅ Test thoroughly
7. ✅ Deploy to production
