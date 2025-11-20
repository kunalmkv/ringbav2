# Dashboard Setup and Usage

This dashboard displays a payout comparison table showing Ringba original payout vs eLocal payout, grouped by date and category (STATIC/API).

## Prerequisites

1. PostgreSQL database with the required tables (`elocal_call_data` with `original_payout` and `original_revenue` columns)
2. Node.js 18+ installed
3. Environment variables configured (`.env` file)

## Installation

1. Install dependencies:
```bash
cd ringbav2
npm install
```

2. Install dashboard React dependencies:
```bash
cd dashboard-react
npm install
cd ..
```

## Running the Dashboard

### Development Mode

1. Start the dashboard server:
```bash
npm run dashboard
```

The server will start on `http://localhost:3000` (or the port specified in `DASHBOARD_PORT` environment variable).

2. In a separate terminal, start the React development server:
```bash
cd dashboard-react
npm run dev
```

### Production Mode

1. Build the React dashboard:
```bash
cd dashboard-react
npm run build
cd ..
```

2. Start the dashboard server:
```bash
npm run dashboard
```

The built React app will be served from the `dashboard-build` directory.

## Environment Variables

Make sure your `.env` file includes:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_SSL=false
DASHBOARD_PORT=3000
```

## Dashboard Features

### Payout Comparison Table

The main feature is a table showing:

- **DATE**: Date in DD/MM/YYYY format
- **RINGBA**: Original payout from Ringba (Static and API columns)
- **E-Local**: Payout from eLocal (Static and API columns)
- **Ringba Total**: Sum of Ringba Static + API
- **Elocal Total**: Sum of eLocal Static + API
- **Adjustments**: Difference between Elocal Total and Ringba Total
- **Adjustment (Static) %**: Percentage difference for STATIC category
- **Adjustment (API) %**: Percentage difference for API category
- **Adjustment %**: Overall percentage difference

### Features

- Date range filtering (start date and end date)
- Refresh button to reload data
- Color-coded rows:
  - Red background for negative adjustments
  - Green background for positive adjustments
  - White background for zero adjustments
- Responsive design for mobile devices
- Real-time data from PostgreSQL database

## API Endpoints

### GET /api/payout-comparison

Returns payout comparison data grouped by date.

**Query Parameters:**
- `startDate` (optional): Start date in YYYY-MM-DD format
- `endDate` (optional): End date in YYYY-MM-DD format

**Response:**
```json
{
  "data": [
    {
      "date": "2025-07-24",
      "ringba_static": 260.40,
      "ringba_api": 89.40,
      "elocal_static": 260.40,
      "elocal_api": 113.40,
      "ringba_total": 349.80,
      "elocal_total": 373.80,
      "adjustments": 24.00,
      "adjustment_static_pct": 0.00,
      "adjustment_api_pct": 26.85,
      "adjustment_pct": 6.86
    }
  ],
  "total": 1
}
```

### GET /api/health

Health check endpoint to verify database connection.

## Troubleshooting

### Dashboard Not Loading

1. Check if the server is running:
```bash
npm run dashboard
```

2. Check database connection in `.env` file

3. Verify database tables exist:
```bash
npm run setup:db
```

### No Data Showing

1. Verify data exists in `elocal_call_data` table:
```sql
SELECT COUNT(*) FROM elocal_call_data;
```

2. Check if `original_payout` and `original_revenue` columns have data:
```sql
SELECT COUNT(*) FROM elocal_call_data WHERE original_payout IS NOT NULL;
```

### Build Errors

1. Clear node_modules and reinstall:
```bash
cd dashboard-react
rm -rf node_modules package-lock.json
npm install
```

2. Rebuild:
```bash
npm run build
```

## File Structure

```
ringbav2/
├── dashboard-server.js          # Express server with PostgreSQL
├── dashboard-react/            # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── PayoutComparison.jsx  # Main payout comparison component
│   │   ├── utils/
│   │   │   └── api.js          # API utility functions
│   │   └── App.jsx             # Main app component
│   └── package.json
├── dashboard-build/            # Built React app (generated)
└── DASHBOARD_README.md         # This file
```

