import React, { useState } from 'react';
import { ChevronDown, Eye, FileCheck2, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import SearchableSelect from '../../components/form/SearchableSelect';
import PremiumDatePicker from '../../components/form/PremiumDatePicker';
import { mediaUrl, uploadMedia, uploadMediaBatch } from '../../services/mediaUpload';

function AddressTab({ client, setValue, copyRegisteredAddress, selectOptions }) {
  return (
    <Card title="Company Address Details">
      <div className="grid gap-5 xl:grid-cols-2">
        <AddressPanel title="Registered Office Address" section="registeredAddress" data={client.registeredAddress} setValue={setValue} selectOptions={selectOptions} />
        <AddressPanel title="Communication Office Address" section="communicationAddress" data={client.communicationAddress} setValue={setValue} onCopy={copyRegisteredAddress} selectOptions={selectOptions} />
      </div>
    </Card>
  );
}

function AddressPanel({ title, section, data, setValue, onCopy, selectOptions }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      {onCopy && <label className="mb-3 inline-flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#30737B]" onChange={(event) => onCopy(event.target.checked)} /> Same as Registered Address</label>}
      <h3 className="text-xl font-black text-slate-950">{title}</h3>
      <div className="mt-5 grid gap-4">
        <Field required label="Address 1"><input className="form-input" value={data.address1 || ''} onChange={(event) => setValue(section, 'address1', event.target.value)} /></Field>
        <Field label="Address 2"><input className="form-input" value={data.address2 || ''} onChange={(event) => setValue(section, 'address2', event.target.value)} /></Field>
        <Field label="Address 3"><input className="form-input" value={data.address3 || ''} onChange={(event) => setValue(section, 'address3', event.target.value)} /></Field>
        <SelectLike required label="State" value={data.state || ''} options={selectOptions.states} onChange={(value) => setValue(section, 'state', value)} />
        <SelectLike required label="City" value={data.city || ''} options={selectOptions.cities} placeholder={data.state ? 'Select or type city' : 'Select state first'} disabled={!data.state} onChange={(value) => setValue(section, 'city', value)} />
        <Field required label="Pincode"><input className="form-input" value={data.pincode || ''} onChange={(event) => setValue(section, 'pincode', event.target.value)} /></Field>
      </div>
    </div>
  );
}

function ComplianceTab({ client, setValue, addRow, updateRow, removeRow, complianceRows }) {
  return (
    <>
      <Card title="Compliance Certificate Upload">
        <div className="grid gap-4">
          {complianceRows.map(([key, numberLabel, dateLabel, fileLabel]) => (
            <div key={key} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[1fr_1fr_180px]">
              <Field label={numberLabel}><input className="form-input" value={client.compliance[`${key}Number`] || ''} onChange={(event) => setValue('compliance', `${key}Number`, event.target.value)} /></Field>
      <Field label={dateLabel}><PremiumDatePicker value={client.compliance[`${key}Date`] || ''} onChange={(event) => setValue('compliance', `${key}Date`, event.target.value)} /></Field>
              <Field label={fileLabel}><UploadButton value={client.compliance[`${key}File`]} onChange={(value) => setValue('compliance', `${key}File`, value)} /></Field>
            </div>
          ))}
        </div>
      </Card>

      <Card title="MSME Details">
        <DynamicTable
          rows={client.msmeRows}
          columns={[
            ['classificationYear', 'MSME Classification Year *'],
            ['status', 'MSME Status *'],
            ['majorActivity', 'MSME Major Activity *'],
            ['udyamNumber', 'MSME Udyam Number *'],
            ['turnover', 'TurnOver of the Company (CR.) *']
          ]}
          uploadColumn="MSME Udyam Certificate"
          onAdd={() => addRow('msmeRows', { classificationYear: '', status: '', majorActivity: '', udyamNumber: '', turnover: '', file: '' })}
          onUpdate={(index, field, value) => updateRow('msmeRows', index, field, value)}
          onRemove={(index) => removeRow('msmeRows', index)}
        />
      </Card>
    </>
  );
}

const emptyPlantConsent = {
  plantName: '',
  cteConsentNo: '',
  cteCategory: '',
  cteIssuedDate: '',
  cteValidDate: '',
  plantLocation: '',
  cteDocument: null,
  cteProductionRows: [],
  ctoOrderNo: '',
  ctoIssueDate: '',
  ctoValidDate: '',
  ctoDocument: null,
  ctoProductRows: []
};

function TableInput({ value, onChange, placeholder = '', type = 'text', options }) {
  if (options) {
    return <div className="min-w-44"><SearchableSelect value={value || ''} options={options} onChange={onChange} placeholder={placeholder || 'Select'} /></div>;
  }

  return (
    <input
      type={type}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="form-input min-h-10 min-w-44 uppercase"
    />
  );
}

function TableUpload({ value, onChange }) {
  return (
    <div className="min-w-44">
      <UploadButton value={value} onChange={onChange} />
    </div>
  );
}

function ConsentTable({ title, eyebrow, plants, columns, onPlantChange }) {
  return (
    <section>
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#30737B]">{eyebrow}</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950">{title}</h3>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-teal-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-cyan-50 text-xs font-black uppercase tracking-[0.08em] text-teal-900">
              <tr>
                <th className="w-20 px-4 py-4 text-center">Sr.No</th>
                <th className="px-4 py-4">Plant Name</th>
                {columns.map((column) => <th key={column.key} className="px-4 py-4">{column.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plants.map((plant, plantIndex) => (
                <tr key={plantIndex} className="transition hover:bg-orange-50/60">
                  <td className="px-4 py-3 text-center font-black text-slate-800">{plantIndex + 1}</td>
                  <td className="px-4 py-3">
                    <TableInput value={plant.plantName} onChange={(value) => onPlantChange(plantIndex, 'plantName', value)} placeholder={`Plant ${plantIndex + 1}`} />
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      {column.type === 'file' ? (
                        <TableUpload value={plant[column.key]} onChange={(value) => onPlantChange(plantIndex, column.key, value)} />
                      ) : (
                        <TableInput
                          type={column.type}
                          value={plant[column.key]}
                          options={column.options}
                          placeholder={column.placeholder}
                          onChange={(value) => onPlantChange(plantIndex, column.key, value)}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PlantQuantityTable({ title, plants, quantityKey, columns, rowTemplate, onAddRow, onUpdateRow, onRemoveRow, onPlantNameChange }) {
  const [selectedPlantIndex, setSelectedPlantIndex] = useState(0);
  const safePlantIndex = Math.min(selectedPlantIndex, Math.max(plants.length - 1, 0));
  const rows = plants.flatMap((plant, plantIndex) =>
    (plant[quantityKey] || []).map((row, rowIndex) => ({ plant, plantIndex, row, rowIndex }))
  );

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-2xl font-black text-slate-950">{title}</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          {plants.length > 1 && (
            <div className="min-w-52"><SearchableSelect value={String(safePlantIndex)} onChange={(value) => setSelectedPlantIndex(Number(value))} options={plants.map((plant, index) => ({ value: String(index), label: plant.plantName || `Plant ${index + 1}` }))} placeholder="Select plant" /></div>
          )}
          <button type="button" onClick={() => onAddRow(safePlantIndex, quantityKey, rowTemplate)} className="btn-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 font-black text-white shadow-lg shadow-emerald-700/20">
            <Plus className="h-4 w-4" /> Add Row
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-teal-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-cyan-50 text-xs font-black uppercase tracking-[0.08em] text-teal-900">
              <tr>
                <th className="w-20 px-4 py-4 text-center">Sr.No</th>
                {columns.map(([field, label], index) => (
                  <React.Fragment key={field}>
                    <th className="px-4 py-4">{label}</th>
                    {index === 0 && <th className="px-4 py-4">Plant Name</th>}
                  </React.Fragment>
                ))}
                <th className="w-36 px-4 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 3} className="px-4 py-12 text-center font-black text-slate-400">No data</td>
                </tr>
              ) : (
                rows.map(({ plant, plantIndex, row, rowIndex }, index) => (
                  <tr key={`${plantIndex}-${rowIndex}`} className="transition hover:bg-orange-50/60">
                    <td className="px-4 py-3 text-center font-black text-slate-800">{index + 1}</td>
                    {columns.map(([field], columnIndex) => (
                      <React.Fragment key={field}>
                        <td className="px-4 py-3">
                          <TableInput value={row[field]} onChange={(value) => onUpdateRow(plantIndex, quantityKey, rowIndex, field, value)} />
                        </td>
                        {columnIndex === 0 && (
                          <td className="px-4 py-3">
                            <TableInput value={plant.plantName} onChange={(value) => onPlantNameChange(plantIndex, value)} placeholder={`Plant ${plantIndex + 1}`} />
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => onRemoveRow(plantIndex, quantityKey, rowIndex)} className="rounded-lg border border-red-200 px-3 py-2 font-black text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CteTab({ client, setValue, selectOptions }) {
  const plants = client.cte.plantWiseDetails || [];

  function setPlants(nextPlants) {
    setValue('cte', 'plantWiseDetails', nextPlants);
  }

  function setPlantCount(value) {
    const count = Math.max(0, Math.min(Number.parseInt(value, 10) || 0, 25));
    const nextPlants = Array.from({ length: count }, (_, index) => ({
      ...emptyPlantConsent,
      ...(plants[index] || {})
    }));
    setValue('cte', 'numberOfPlantsLocations', value);
    setPlants(nextPlants);
  }

  function updatePlant(plantIndex, field, value) {
    setPlants(plants.map((plant, index) => (index === plantIndex ? { ...plant, [field]: value } : plant)));
  }

  function addPlantRow(plantIndex, key, rowTemplate) {
    setPlants(plants.map((plant, index) => (
      index === plantIndex ? { ...plant, [key]: [...(plant[key] || []), rowTemplate] } : plant
    )));
  }

  function updatePlantRow(plantIndex, key, rowIndex, field, value) {
    setPlants(plants.map((plant, index) => (
      index === plantIndex
        ? { ...plant, [key]: (plant[key] || []).map((row, itemIndex) => (itemIndex === rowIndex ? { ...row, [field]: value } : row)) }
        : plant
    )));
  }

  function removePlantRow(plantIndex, key, rowIndex) {
    setPlants(plants.map((plant, index) => (
      index === plantIndex ? { ...plant, [key]: (plant[key] || []).filter((_, itemIndex) => itemIndex !== rowIndex) } : plant
    )));
  }

  return (
    <Card title="CTE & CTO/CCA Details">
      <div className="space-y-7">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#30737B]">Plant Setup</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Enter number of plant locations first</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">If user enters 2, complete CTE and CTO/CCA detail tables will appear twice.</p>
            </div>
            <Field label="Number of Plant Locations">
              <input type="number" min="0" max="25" className="form-input" value={client.cte.numberOfPlantsLocations || ''} onChange={(event) => setPlantCount(event.target.value)} placeholder="1 or 2" />
            </Field>
          </div>
        </div>

        {!plants.length ? (
          <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-5 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-[#30737B]" />
            <h3 className="mt-3 text-lg font-black text-slate-950">Add plant count to begin</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">CTE and CTO/CCA tables unlock after entering plant locations count.</p>
          </div>
        ) : (
          <>
            <ConsentTable
              title="CTE Details"
              eyebrow="Consent Establishment"
              plants={plants}
              columns={[
                { key: 'cteConsentNo', label: 'CTE Consent No.', placeholder: 'Enter consent no.' },
                { key: 'cteCategory', label: 'CTE Category', placeholder: 'Enter category' },
                { key: 'cteIssuedDate', label: 'CTE Issued Year', placeholder: 'Select year', options: selectOptions.years },
                { key: 'cteValidDate', label: 'CTE Valid Upto', placeholder: 'Select year', options: selectOptions.years },
                { key: 'plantLocation', label: 'Plant Location', placeholder: 'Enter location' },
                { key: 'cteDocument', label: 'CTE Document Upload', type: 'file' }
              ]}
              onPlantChange={updatePlant}
            />

            <PlantQuantityTable
              title="CTE Production Quantity per Year"
              plants={plants}
              quantityKey="cteProductionRows"
              columns={[['productName', 'Product Name'], ['capacity', 'Maximum Production Capacity / Year']]}
              rowTemplate={{ productName: '', capacity: '' }}
              onAddRow={addPlantRow}
              onUpdateRow={updatePlantRow}
              onRemoveRow={removePlantRow}
              onPlantNameChange={(plantIndex, value) => updatePlant(plantIndex, 'plantName', value)}
            />

            <ConsentTable
              title="CTO/CCA Details"
              eyebrow="Consent Operation"
              plants={plants}
              columns={[
                { key: 'ctoOrderNo', label: 'CTO/CCA Consent Order No.', placeholder: 'Enter order no.' },
                { key: 'ctoIssueDate', label: 'CTO/CCA Date of Issue', placeholder: 'Select year', options: selectOptions.years },
                { key: 'ctoValidDate', label: 'CTO/CCA Valid Upto', placeholder: 'Select year', options: selectOptions.years },
                { key: 'ctoDocument', label: 'CTO/CCA Document Upload', type: 'file' }
              ]}
              onPlantChange={updatePlant}
            />

            <PlantQuantityTable
              title="CTO/CCA Product Quantity"
              plants={plants}
              quantityKey="ctoProductRows"
              columns={[['productName', 'Name Of The Product'], ['quantity', 'Quantity']]}
              rowTemplate={{ productName: '', quantity: '' }}
              onAddRow={addPlantRow}
              onUpdateRow={updatePlantRow}
              onRemoveRow={removePlantRow}
              onPlantNameChange={(plantIndex, value) => updatePlant(plantIndex, 'plantName', value)}
            />
          </>
        )}
      </div>
    </Card>
  );
}

function CpcbTab({ client, setValue, selectOptions }) {
  return (
    <Card title="CPCB Login Credential">
      <div className="grid gap-5 md:grid-cols-2">
        <SelectLike required label="CPCB Status" value={client.cpcb.status || ''} options={selectOptions.cpcbStatus} onChange={(value) => setValue('cpcb', 'status', value)} />
        <Field label="Remark"><textarea className="form-input min-h-[92px] resize-y py-3" value={client.cpcb.remark || ''} onChange={(event) => setValue('cpcb', 'remark', event.target.value)} /></Field>
        <Field label="CPCB Home page"><UploadButton value={client.cpcb.homePageFile} onChange={(value) => setValue('cpcb', 'homePageFile', value)} /></Field>
        <Field label="CPCB Registration Number"><input className="form-input" value={client.cpcb.registrationNumber || ''} onChange={(event) => setValue('cpcb', 'registrationNumber', event.target.value)} /></Field>
          <Field label="Date of Application"><PremiumDatePicker value={client.cpcb.applicationDate || ''} onChange={(event) => setValue('cpcb', 'applicationDate', event.target.value)} /></Field>
          <Field label="Date of Application Approval"><PremiumDatePicker value={client.cpcb.approvalDate || ''} onChange={(event) => setValue('cpcb', 'approvalDate', event.target.value)} /></Field>
        <Field label="Application Number"><input className="form-input" value={client.cpcb.applicationNumber || ''} onChange={(event) => setValue('cpcb', 'applicationNumber', event.target.value)} /></Field>
        <Field label="CEPR User ID"><input className="form-input" value={client.cpcb.ceprUserId || ''} onChange={(event) => setValue('cpcb', 'ceprUserId', event.target.value)} /></Field>
        <Field label="CEPR Password"><input type="password" className="form-input" value={client.cpcb.ceprPassword || ''} onChange={(event) => setValue('cpcb', 'ceprPassword', event.target.value)} /></Field>
        <Field label="CPCB Login ID"><input className="form-input" value={client.cpcb.loginId || ''} onChange={(event) => setValue('cpcb', 'loginId', event.target.value)} /></Field>
        <Field label="CPCB Login Password"><input type="password" className="form-input" value={client.cpcb.loginPassword || ''} onChange={(event) => setValue('cpcb', 'loginPassword', event.target.value)} /></Field>
      </div>
    </Card>
  );
}

function CpcbScreenshotTab({ client, setRoot, onValidationError }) {
  const items = Array.isArray(client.cpcbScreenshots) ? client.cpcbScreenshots : [];

  function updateItems(nextItems) {
    setRoot('cpcbScreenshots', nextItems);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    try {
      const cloudFiles = await uploadMediaBatch(files, 'crm/client-master/cpcb');
      const uploaded = cloudFiles.map((file) => ({ id: file.publicId, name: '', file }));
      updateItems([...items, ...uploaded]);
      onValidationError?.(`Add a name for ${uploaded.length === 1 ? 'the uploaded file' : `all ${uploaded.length} uploaded files`} before saving.`);
    } catch (error) {
      onValidationError?.(error.message || 'Unable to upload files to Cloudinary.');
    }
  }

  function updateItem(index, field, value) {
    updateItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  return (
    <Card title="CPCB Screenshot">
      <div className="rounded-2xl border border-dashed border-teal-300 bg-gradient-to-br from-teal-50 via-white to-orange-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#30737B] text-white shadow-lg shadow-teal-900/20"><Upload className="h-6 w-6" /></div>
        <h3 className="mt-4 text-xl font-black text-slate-950">Upload screenshots and documents</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-slate-500">Select multiple files at once for bulk upload. Give every file a clear name so the team can identify it later.</p>
        <label className="btn-lift mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-6 font-black text-white shadow-lg shadow-emerald-700/20">
          <Upload className="h-4 w-4" /> Bulk Upload
          <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        </label>
      </div>

      {items.length ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {items.map((item, index) => (
            <div key={item.id || index} className={`rounded-2xl border bg-white p-4 shadow-sm ${String(item.name || '').trim() ? 'border-slate-200' : 'border-red-300 ring-2 ring-red-50'}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#30737B]"><FileCheck2 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-800">{item.file?.name || 'No file selected'}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">Screenshot / supporting document</p>
                </div>
                <button type="button" aria-label="Remove file" onClick={() => updateItems(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-5 w-5" /></button>
              </div>
              <Field required label="Document Name">
                <input className="form-input" value={item.name || ''} onChange={(event) => updateItem(index, 'name', event.target.value)} placeholder="e.g. CPCB dashboard screenshot" />
              </Field>
              {!String(item.name || '').trim() && <p className="mt-2 text-xs font-black text-red-500">Document name is required.</p>}
              <button type="button" onClick={() => window.open(item.file?.dataUrl || item.file?.url, '_blank', 'noopener,noreferrer')} className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#30737B]"><Eye className="h-4 w-4" /> Preview file</button>
            </div>
          ))}
        </div>
      ) : <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-10 text-center font-bold text-slate-400">No CPCB screenshots or documents uploaded yet.</div>}
    </Card>
  );
}

function ContactsTab({ client, setValue }) {
  return (
    <>
      <Card title="OTP Contact">
        <div className="grid gap-5 md:grid-cols-2">
          <Field required label="OTP Enabled Mobile No"><input className="form-input" value={client.otp.mobile || ''} onChange={(event) => setValue('otp', 'mobile', event.target.value)} /></Field>
          <Field label="OTP Person Name"><input className="form-input" value={client.otp.personName || ''} onChange={(event) => setValue('otp', 'personName', event.target.value)} /></Field>
          <Field label="OTP Person Designation"><input className="form-input" value={client.otp.designation || ''} onChange={(event) => setValue('otp', 'designation', event.target.value)} /></Field>
        </div>
      </Card>
      <PersonCard title="Authorised Person" section="authorised" client={client} setValue={setValue} includePan />
      <PersonCard title="Coordinating Person" section="coordinating" client={client} setValue={setValue} />
    </>
  );
}

function PersonCard({ title, section, client, setValue, includePan }) {
  const data = client[section];
  return (
    <Card title={title}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={`${title} Name`}><input className="form-input" value={data.name || ''} onChange={(event) => setValue(section, 'name', event.target.value)} /></Field>
        <Field label={`${title} Designation`}><input className="form-input" value={data.designation || ''} onChange={(event) => setValue(section, 'designation', event.target.value)} /></Field>
        <Field label={`Department of ${title.toLowerCase()}`}><input className="form-input" value={data.department || ''} onChange={(event) => setValue(section, 'department', event.target.value)} /></Field>
        <Field label="Reporting Person Details"><input className="form-input" value={data.reporting || ''} onChange={(event) => setValue(section, 'reporting', event.target.value)} /></Field>
        <Field required label={`${title} Mobile`}><input className="form-input" value={data.mobile || ''} onChange={(event) => setValue(section, 'mobile', event.target.value)} /></Field>
        <Field required label={`${title} Email`}><input className="form-input" value={data.email || ''} onChange={(event) => setValue(section, 'email', event.target.value)} /></Field>
        {includePan && <Field label={`${title} PAN Number`}><input className="form-input" value={data.pan || ''} onChange={(event) => setValue(section, 'pan', event.target.value)} /></Field>}
        {includePan && <Field label={`${title} PAN Document`}><UploadButton value={data.panDocument} onChange={(value) => setValue(section, 'panDocument', value)} /></Field>}
      </div>
    </Card>
  );
}

function DynamicTable({ title, rows, columns, uploadColumn, onAdd, onUpdate, onRemove }) {
  return (
    <div className="mt-6">
      {title && <h3 className="text-xl font-black text-slate-950">{title}</h3>}
      <button type="button" onClick={onAdd} className="btn-lift mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 font-black text-white shadow-lg shadow-emerald-700/20">
        <Plus className="h-4 w-4" /> Add Row
      </button>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-4">Sr.No</th>
              {columns.map(([, label]) => <th key={label} className="px-4 py-4">{label}</th>)}
              {uploadColumn && <th className="px-4 py-4">{uploadColumn}</th>}
              <th className="px-4 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (uploadColumn ? 3 : 2)} className="px-4 py-12 text-center font-black text-slate-400">No data</td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100">
                <td className="px-4 py-3 font-black">{index + 1}</td>
                {columns.map(([field]) => (
                  <td key={field} className="px-4 py-3">
                    <input className="form-input min-h-10" value={row[field] || ''} onChange={(event) => onUpdate(index, field, event.target.value)} />
                  </td>
                ))}
                {uploadColumn && <td className="px-4 py-3"><UploadButton value={row.file} onChange={(value) => onUpdate(index, 'file', value)} /></td>}
                <td className="px-4 py-3 text-center">
                  <button type="button" onClick={() => onRemove(index)} className="rounded-lg border border-red-200 px-3 py-2 font-black text-red-600 hover:bg-red-50">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadButton({ value, onChange }) {
  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    onChange(await uploadMedia(file, 'crm/client-master/documents'));
  }

  function viewFile() {
    const url = mediaUrl(value);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <label className="btn-lift inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 hover:bg-slate-50">
          <Upload className="h-4 w-4" /> Upload
          <input type="file" className="sr-only" onChange={handleFile} />
        </label>
        {(value?.dataUrl || value?.url || typeof value === 'string') && (
          <button type="button" onClick={viewFile} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 font-black text-emerald-700 hover:bg-emerald-100">
            <Eye className="h-4 w-4" /> View
          </button>
        )}
      </div>
      {value?.name && <p className="max-w-56 truncate text-xs font-bold text-slate-500">{value.name}</p>}
    </div>
  );
}

function Card({ title, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SelectLike({ label, required, value, options = [], onChange, disabled = false, placeholder = 'Select or type to create new' }) {
  return (
    <Field label={label} required={required}>
      <SearchableSelect value={value} options={options} onChange={onChange} disabled={disabled} placeholder={placeholder} />
    </Field>
  );
}


export {
  AddressTab,
  ComplianceTab,
  CteTab,
  CpcbTab,
  CpcbScreenshotTab,
  ContactsTab,
  Card,
  Field,
  SelectLike,
  UploadButton
};

