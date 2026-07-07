# Frontend Integration Guide: Product Bulk Upload

This guide details the integration requirements for implementing the **Product Bulk Upload** feature inside the Admin Control Panel.

---

## 1. Flow Overview
The bulk upload process runs asynchronously via a background queue. The frontend interface follows a **2-step lifecycle**:
1. **Upload Spreadsheet**: The admin uploads the `.xlsx` or `.csv` spreadsheet file. The backend saves the file, enqueues the worker job, and immediately returns a job `refId`.
2. **Poll Progress**: The frontend polls the status endpoint using the `refId` to display a real-time progress bar and any validation errors upon completion.

> [!NOTE]
> **Media Resolution**: Images referenced in the spreadsheet must be uploaded first via the centralized **Media Gallery** dashboard (available under `/gallery`) so the importer worker can link them correctly.

---

## 2. API Endpoints

### A. Upload Spreadsheet
* **Endpoint**: `POST /api/v1/products/bulk-upload`
* **Content-Type**: `multipart/form-data`
* **Request Payload**:
  - `file`: The `.xlsx` or `.csv` spreadsheet file (mandatory).
* **Response (201 Created)**:
  ```json
  {
    "statusCode": 201,
    "message": "Bulk upload enqueued successfully",
    "data": {
      "refId": "BUP20268571",
      "status": "queued",
      "fileUrl": "bulk-uploads/8ac75d1b-uuid.xlsx",
      "createdAt": "2026-07-06T12:00:00.000Z"
    }
  }
  ```

---

### B. List Upload History
* **Endpoint**: `GET /api/v1/products/bulk-upload/history?page=1&limit=20`
* **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Bulk upload history retrieved successfully",
    "data": {
      "data": [
        {
          "refId": "BUP20268571",
          "status": "partial_success",
          "fileUrl": "bulk-uploads/8ac75d1b-uuid.xlsx",
          "errorFileUrl": "bulk-uploads/errors/errors-BUP20268571.xlsx",
          "totalRows": 250,
          "processedRows": 250,
          "successfulRows": 240,
          "failedRows": 10,
          "createdAt": "2026-07-06T12:00:00.000Z",
          "completedAt": "2026-07-06T12:01:15.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1
      }
    }
  }
  ```

---

### C. Get Job Details & Progress
* **Endpoint**: `GET /api/v1/products/bulk-upload/:refId`
* **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Bulk upload status retrieved successfully",
    "data": {
      "refId": "BUP20268571",
      "status": "partial_success",
      "progress": {
        "totalRows": 250,
        "processedRows": 250,
        "successfulRows": 240,
        "failedRows": 10,
        "percentage": 100
      },
      "errorFileUrl": "bulk-uploads/errors/errors-BUP20268571.xlsx",
      "errorSummary": [
        {
          "rowNumber": 12,
          "sku": "WP002",
          "column": "Selling Price",
          "invalidValue": "1500 vs MRP 1200",
          "reason": "Selling price cannot exceed the product MRP.",
          "suggestedFix": "Lower the selling price or adjust the MRP."
        }
      ],
      "createdAt": "2026-07-06T12:00:00.000Z",
      "completedAt": "2026-07-06T12:01:15.000Z"
    }
  }
  ```

---

## 3. UI/UX Design Requirements

### 1. Upload Panel
* Render a drop-zone uploader supporting `.xlsx` and `.csv` files.
* Validates file size (< 20MB) client-side before starting submission.

### 2. Active Progress Screen
* When the upload request returns `201 Created`, transition the uploader card to the progress screen.
* Poll `GET /api/v1/products/bulk-upload/:refId` every **2 seconds** while `status` is one of `pending`, `queued`, `validating`, or `processing`.
* Bind the progress bar width to `progress.percentage`.

### 3. In-Console Error Summary Table
* If `failedRows > 0`, render the `errorSummary` list in an interactive table:
  | Row | SKU Code | Failing Column | Invalid Value | Error Reason | Suggested Correction |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | 12 | WP002 | Selling Price | 1500 vs 1200 | Cannot exceed MRP | Lower selling price |
