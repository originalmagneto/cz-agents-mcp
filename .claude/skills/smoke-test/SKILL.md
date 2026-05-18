---
name: smoke-test
description: Hit /health on all 10 cz-agents containers on Hetzner and print a status table (name | port | version | status). Use after any deploy or to verify production state.
disable-model-invocation: true
---

# smoke-test

Check health of all cz-agents MCP containers on Hetzner production.

## Run this Bash command via SSH

```bash
ssh -i ~/.ssh/id_rsa_macbook martin@91.98.119.223 "
printf '%-25s %-6s %-10s %s\n' 'SERVICE' 'PORT' 'VERSION' 'STATUS'
printf '%-25s %-6s %-10s %s\n' '-------' '----' '-------' '------'
for entry in 'cz-agents-ares:3030' 'cz-agents-cnb:3031' 'cz-agents-sanctions:3032' 'cz-agents-dd:3033' 'cz-agents-isir:3034' 'cz-agents-adis:3035' 'cz-agents-realestate:3036' 'cz-agents-ddplus:3037' 'cz-agents-realestate-pro:3038'; do
  name=\$(echo \$entry | cut -d: -f1)
  port=\$(echo \$entry | cut -d: -f2)
  resp=\$(docker exec \$name wget -qO- http://localhost:\$port/health 2>/dev/null || echo '{\"status\":\"DOWN\"}')
  ver=\$(echo \$resp | grep -oP '\"version\":\"\\K[^\"]+' || echo '-')
  st=\$(echo \$resp | grep -oP '\"status\":\"\\K[^\"]+' || echo 'DOWN')
  printf '%-25s %-6s %-10s %s\n' \$name \$port \$ver \$st
done
"
```

## Expected output
All services should show `ok`. Any `DOWN` needs investigation.

## Also check webapp
```bash
ssh -i ~/.ssh/id_rsa_macbook martin@91.98.119.223 "curl -so /dev/null -w '%{http_code}' http://127.0.0.1:3050/api/health || echo DOWN"
```
