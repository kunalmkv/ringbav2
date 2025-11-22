#!/bin/bash
# Script to test database queries
# Usage: ./run-sql-test.sh

echo "Testing Dashboard Database Queries..."
echo "======================================"
echo ""

# Get database credentials from .env or use defaults
DB_HOST=${POSTGRES_HOST:-${DB_HOST:-localhost}}
DB_PORT=${POSTGRES_PORT:-${DB_PORT:-5432}}
DB_NAME=${POSTGRES_DB_NAME:-${DB_NAME}}
DB_USER=${POSTGRES_USER_NAME:-${DB_USER}}
DB_PASSWORD=${POSTGRES_PASSWORD:-${DB_PASSWORD}}

echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "User: $DB_USER"
echo ""

# Test connection
echo "1. Testing connection..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT NOW();" || {
    echo "ERROR: Cannot connect to database!"
    exit 1
}

echo ""
echo "2. Counting records in elocal_call_data..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) as total FROM elocal_call_data;"

echo ""
echo "3. Getting sample data..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT SUBSTRING(date_of_call, 1, 10) as date, category, COUNT(*) as count FROM elocal_call_data GROUP BY SUBSTRING(date_of_call, 1, 10), category ORDER BY date DESC LIMIT 10;"

echo ""
echo "4. Getting RPC data..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT summary_date, rpc, campaign_name FROM ringba_campaign_summary ORDER BY summary_date DESC LIMIT 10;"

echo ""
echo "Done!"
