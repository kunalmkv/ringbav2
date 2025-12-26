# Commands to View Ringba Cost Sync Logs

## Log File Location
Logs are stored in: `ringbav2/logs/`

## Log File Naming Pattern
- Scheduler logs: `ringba-cost-scheduler-YYYY-MM-DDTHH-MM-SS.log`
- Manual sync logs: `ringba-cost-sync-YYYY-MM-DDTHH-MM-SS.log`

## Commands

### 1. View Latest Log File (Most Recent)
```bash
# Navigate to project directory
cd /path/to/elocal-scrapper/ringbav2

# View the latest ringba-cost-scheduler log
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs cat

# Or using tail to see last 100 lines
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -100
```

### 2. Follow Latest Log in Real-Time (Tail)
```bash
# Follow the latest log file (updates as new logs are written)
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -f
```

### 3. View All Ringba Cost Logs (Sorted by Date)
```bash
# List all ringba-cost logs sorted by modification time (newest first)
ls -t logs/ringba-cost-*.log

# View all logs with details
ls -lht logs/ringba-cost-*.log
```

### 4. View Specific Date Range Logs
```bash
# View logs from a specific date (e.g., 2025-11-26)
ls -t logs/ringba-cost-*-2025-11-26*.log | xargs cat

# View logs from last 7 days
find logs/ -name "ringba-cost-*.log" -mtime -7 -exec ls -t {} \; | head -5 | xargs tail -50
```

### 5. Search Within Logs
```bash
# Search for specific text in all ringba-cost logs
grep -r "Ringba Cost Sync" logs/ringba-cost-*.log

# Search for errors
grep -i "error\|failed\|❌" logs/ringba-cost-*.log

# Search for successful updates
grep -i "successfully updated\|✅" logs/ringba-cost-*.log

# Search for specific call ID
grep "inbound_call_id\|elocalCallId" logs/ringba-cost-*.log

# Search with context (5 lines before and after)
grep -C 5 "ERROR" logs/ringba-cost-*.log
```

### 6. View Log Statistics
```bash
# Count total log files
ls logs/ringba-cost-*.log | wc -l

# View log file sizes
ls -lh logs/ringba-cost-*.log

# Find largest log file
ls -lhS logs/ringba-cost-*.log | head -1
```

### 7. View Last N Lines from Latest Log
```bash
# Last 50 lines
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -50

# Last 200 lines
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -200

# Last 1000 lines (for detailed analysis)
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -1000
```

### 8. Filter Logs by Content
```bash
# View only sync summaries
grep -A 20 "Sync Summary" logs/ringba-cost-*.log

# View only unmatched calls
grep -A 10 "Unmatched eLocal calls" logs/ringba-cost-*.log

# View only update operations
grep -A 5 "Updating call" logs/ringba-cost-*.log
```

### 9. Combine Multiple Logs
```bash
# View all logs from today combined
ls -t logs/ringba-cost-*-$(date +%Y-%m-%d)*.log | xargs cat

# View last 3 log files combined
ls -t logs/ringba-cost-*.log | head -3 | xargs cat
```

### 10. Monitor Logs in Real-Time (All New Logs)
```bash
# Monitor all new ringba-cost log files
tail -f logs/ringba-cost-*.log

# Or use multitail if available
multitail logs/ringba-cost-*.log
```

## Quick Reference Commands

### Most Common Commands:

```bash
# 1. View latest log (last 100 lines)
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -100

# 2. Follow latest log in real-time
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs tail -f

# 3. Search for errors in all logs
grep -i "error\|failed" logs/ringba-cost-*.log

# 4. View sync summary from latest log
ls -t logs/ringba-cost-scheduler-*.log | head -1 | xargs grep -A 15 "Sync Summary"
```

## Server-Specific Paths

If running on a server, adjust the path accordingly:

```bash
# Example: If project is in /home/user/elocal-scrapper
cd /home/user/elocal-scrapper/ringbav2

# Or if using absolute path
tail -f /home/user/elocal-scrapper/ringbav2/logs/ringba-cost-scheduler-*.log
```

## Using with PM2 (if service is managed by PM2)

```bash
# View PM2 logs for ringba-cost service
pm2 logs ringba-cost-scheduler

# View last 100 lines
pm2 logs ringba-cost-scheduler --lines 100

# Follow logs in real-time
pm2 logs ringba-cost-scheduler --lines 0
```



