# API Reference — Al-Rahma Academy

Base URL: `https://al-rahmaacademy.com/api`  
All requests accept and return `application/json`.  
Mutating requests (`POST / PUT / PATCH / DELETE`) require the `X-CSRF-Token` header set to the value of the `csrf_token` cookie.  
Authenticated endpoints require the `auth_token` httpOnly cookie (set on login).

---

## Authentication

### POST /auth/register
Register a new student account.
```json
{ "name": "string", "email": "string", "password": "string (min 8)", "role": "student|teacher|parent" }
```
**Response 201:** `{ "user": {...}, "token": "..." }`

### POST /auth/login
```json
{ "email": "string", "password": "string" }
```
**Response 200:** sets `auth_token` + `refresh_token` httpOnly cookies.

### POST /auth/logout
Clears cookies and revokes the refresh token family.

### POST /auth/forgot-password
```json
{ "email": "string" }
```
Sends a password-reset email.

### POST /auth/reset-password
```json
{ "token": "string", "password": "string" }
```

### GET /auth/me *(authenticated)*
Returns the authenticated user profile.

---

## Search

### GET /search?q={query}
Global search across courses, blog posts, and teachers. `q` must be ≥ 2 characters.  
**Response:** `{ q, results: { courses[], posts[], teachers[] } }`

### GET /search/courses?q=&level=&page=&limit=
Filter/search courses.

### GET /search/teachers?q=&subject=&gender=&language=&page=&limit=
Filter/search teachers.

---

## Blog

### GET /blog?page=&limit=&category=&tag=
List published posts.  
**Response:** `{ posts[], total, page, pages }`

### GET /blog/:slug
Get single post by slug. Increments view count.

---

## Reviews

### GET /reviews/teacher/:teacherId?page=&limit=
Approved reviews for a teacher. Includes avg rating + count.

### GET /reviews/course/:courseId?page=&limit=
Approved reviews for a course.

### POST /reviews *(authenticated)*
```json
{ "rating": 1-5, "body": "string", "title": "string?", "teacherId?": "id", "courseId?": "id" }
```
One submission per (student + teacher/course) pair.

---

## Notifications *(authenticated)*

### GET /notifications?page=&limit=&unread=true
List notifications for the authenticated user.

### GET /notifications/unread
Returns `{ count: N }` — refreshes every 30 seconds in the frontend.

### PATCH /notifications/:id/read
Mark a single notification as read.

### PATCH /notifications/read-all
Mark all notifications as read.

### DELETE /notifications/:id
Delete a notification.

---

## Contact

### POST /contact
Public — submit a contact message.
```json
{ "name": "string", "email": "string", "phone?": "string", "subject": "string", "message": "string (10–3000 chars)" }
```
**Response 201:** `{ message: "Message received...", id }`

---

## Coupons

### POST /coupons/validate *(authenticated)*
```json
{ "code": "string" }
```
**Response:** `{ valid, code, discountType, discountValue, description }`

---

## Wishlist *(authenticated)*

### GET /wishlist
Returns `{ courses[] }` with populated course details.

### POST /wishlist
```json
{ "courseId": "string" }
```

### DELETE /wishlist/:courseId
Remove a course from the wishlist.

### DELETE /wishlist/clear
Clear the entire wishlist.

---

## Payments

### POST /payments/stripe
Create a Stripe Checkout Session.  
**Response:** `{ type: "redirect", url, sessionId }`

### POST /payments/paypal
Create a PayPal order.  
**Response:** `{ type: "redirect", url, orderId }`

### POST /payments/paypal/:orderId/capture
Capture an approved PayPal order.

### POST /payments/stripe/webhook
Stripe webhook endpoint — receives `payment_intent.*` and `customer.subscription.*` events.

---

## Error Responses

All errors follow:
```json
{ "message": "Human-readable error description" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation failure |
| 401 | Not authenticated |
| 403 | Forbidden (CSRF invalid, insufficient role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, duplicate review) |
| 422 | Unprocessable entity (express-validator errors) |
| 429 | Rate limit exceeded |
| 500 | Internal server error (message sanitised in production) |
| 503 | Database unavailable |
