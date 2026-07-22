const liveClientSync = require('../services/liveClientSync');

function handleError(res, error) {
  return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Client synchronization failed', details: error.details });
}

exports.preview = async (req, res) => {
  try { return res.json({ ok: true, ...(await liveClientSync.previewSync()) }); }
  catch (error) { return handleError(res, error); }
};

exports.batch = async (req, res) => {
  try { return res.json(await liveClientSync.syncBatch(req.body || {})); }
  catch (error) { return handleError(res, error); }
};

exports.reconcile = async (req, res) => {
  try {
    const failedRecords = req.body?.failedRecords || [];
    return res.json(await liveClientSync.reconcileSync({ syncRunId: req.body?.syncRunId, startedAt: req.body?.startedAt, failedRecords }));
  } catch (error) { return handleError(res, error); }
};
