# Frontend Integration Guide: Gallery Management

This document details the integration specifications for implementing the **Gallery Management** panel.

---

## 1. Overview of the Flow
The Gallery Management system is a centralized dashboard where administrators can upload, list, search, and delete image assets.
* **Unified Import Linking**: When importing products via spreadsheet bulk upload, the worker will automatically query this Gallery. If a filename matches the primary/gallery image cell in the sheet (e.g. `success-simple.jpg`), the backend automatically resolves and copies the image to the product variant.

---

## 2. API Endpoints

### A. Upload Images to Gallery
* **Endpoint**: `POST /api/v1/gallery/upload`
* **Content-Type**: `multipart/form-data`
* **Headers**: `Authorization: Bearer <token>`
* **Payload**:
  - `file`: One or more image files (e.g. `filename.jpg`, `filename.png`). Supports multi-file selection.
* **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Images uploaded successfully",
    "data": {
      "message": "Successfully uploaded 2 images to gallery.",
      "files": [
        {
          "refId": "GAL20261234",
          "filename": "success-simple.jpg",
          "url": "gallery/success-simple.jpg",
          "createdAt": "2026-07-06T12:00:00.000Z"
        },
        {
          "refId": "GAL20265678",
          "filename": "success-variant.jpg",
          "url": "gallery/success-variant.jpg",
          "createdAt": "2026-07-06T12:00:01.000Z"
        }
      ]
    }
  }
  ```

---

### B. List Gallery History with Search & Pagination
* **Endpoint**: `GET /api/v1/gallery?page=1&limit=20&search=success`
* **Headers**: `Authorization: Bearer <token>`
* **Query Parameters**:
  - `page`: Page number (default: `1`)
  - `limit`: Records per page (default: `20`)
  - `search`: Filter results by filename (case-insensitive substring search)
* **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Gallery images retrieved successfully",
    "data": {
      "data": [
        {
          "refId": "GAL20261234",
          "filename": "success-simple.jpg",
          "url": "gallery/success-simple.jpg",
          "mimetype": "image/jpeg",
          "createdAt": "2026-07-06T12:00:00.000Z"
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

### C. Delete Image by Ref ID
* **Endpoint**: `DELETE /api/v1/gallery/:refId`
* **Headers**: `Authorization: Bearer <token>`
* **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Image deleted successfully",
    "data": {
      "message": "Gallery image 'GAL20261234' deleted successfully."
    }
  }
  ```

---

## 3. UI/UX Design Requirements

### 1. Sidebar Option
* Add a **"Gallery"** option in the Admin sidebar list under the "Products" section or main dashboard settings:
  ```typescript
  {
    key: "products-gallery",
    name: "Media Gallery",
    icon: ImageIcon,
    href: "/products/gallery",
  }
  ```

### 2. Main Gallery Page Layout
Create a rich media dashboard divided into two parts:
* **Top Bar**:
  * An interactive **Search Input** mapped to the `search` query parameter (trigger searches dynamically with debounce or on Enter).
  * An **"Upload Images"** button opening a multi-file selector.
* **Grid Layout**:
  * Renders images inside cards. Display a thumbnail preview using the returned storage bucket `url` path.
  * Render the `filename`, file format, and creation date.
  * Include a delete button (Trash icon) that triggers the `DELETE /api/v1/gallery/:refId` endpoint.

---

## 4. React Axios Code Examples

### 1. Multiple Files Upload
```tsx
const uploadFiles = async (files: FileList) => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('file', files[i]);
  }

  const response = await axios.post('/api/v1/gallery/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${token}`
    }
  });
  return response.data;
};
```

### 2. List & Search Hook
```tsx
const useGallery = (page: number, limit: number, search: string) => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    axios.get(`/api/v1/gallery`, {
      params: { page, limit, search },
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => {
      setData(res.data.data.data);
      setPagination(res.data.data.pagination);
    });
  }, [page, limit, search]);

  return { data, pagination };
};
```
