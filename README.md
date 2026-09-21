# atlas-observability-lab

A tiny containerized **checkout** service (Node.js/Express) that depends on a
downstream **payments** check, plus a local monitoring stack (Prometheus +
Grafana). Everything runs locally with Docker Compose at ₹0 cost.

> ⚠️ **This repository is intentionally broken.** It ships with **three planted
> faults** that together create a *silent incident*: the service looks healthy,
> the failing request is hidden in the logs, and the alert never fires. Your job
> is to make it production-ready by fixing all three.

---

## Quick start

```bash
docker compose up -d --build
curl -i http://localhost:8080/            # Atlas checkout is running
curl -i http://localhost:8080/checkout    # payment simulation
curl -i http://localhost:8080/health      # health probe
curl -s http://localhost:8080/metrics     # Prometheus metrics
```

- App: http://localhost:8080
- Prometheus: http://localhost:9090 (alerts at `/alerts`)
- Grafana: http://localhost:3000 (anonymous admin)

## Simulate the dependency being down

The payments dependency is controlled by the `FORCE_DEP_DOWN` env var. Bring the
stack up with the dependency forced down, then drive an error spike:

```bash
FORCE_DEP_DOWN=1 docker compose up -d --build
./simulate-incident.sh 120        # hammer /checkout for 120s
```

---

## Expected (production-ready) behaviour

Once the faults are fixed, the following must all hold:

### Health check — truthful
- `/health` returns **`200 {"status":"ok"}`** when the payments dependency is up.
- `/health` returns **`503 {"status":"degraded"}`** when the dependency is down.
- The Docker `HEALTHCHECK` hits `/health`, so the container reports
  **`unhealthy`** (`docker ps`) when the dependency is down.

### Logs — queryable incident evidence
- Every request emits **one JSON object per line** with fields:
  `timestamp`, `level`, `request_id`, `message`.
- **Failures are logged at `level: error` with a `request_id`**, so the incident
  can be isolated and traced:

  ```bash
  docker compose logs app | grep '"level":"error"'
  ```

### Metrics & alert — fires on a real spike
- `/metrics` is exposed on **port 8080** and scraped by Prometheus.
- Intended alert **`HighErrorRate`** fires when the checkout error rate is
  **> 10% for 1m**.
- During a forced error spike, `HighErrorRate` reaches **FIRING** at
  http://localhost:9090/alerts.

---

## Verification sequence (after all three fixes)

```bash
docker compose up -d --build
curl -i http://localhost:8080/health                 # 200 {"status":"ok"} when dep up

# with the dependency forced down:
FORCE_DEP_DOWN=1 docker compose up -d --build
curl -i http://localhost:8080/health                 # 503 {"status":"degraded"}; container unhealthy
docker compose logs app | grep '"level":"error"'     # shows the failing request with a request_id

./simulate-incident.sh 120
# http://localhost:9090/alerts -> HighErrorRate FIRING
```

---

## The three faults to fix

| Task | Area | What's wrong |
|---|---|---|
| 1 | Health checks | `/health` is hardcoded to 200 and ignores the dependency |
| 2 | Structured logging | The failing `/checkout` path logs without `level: error` and without a `request_id` |
| 3 | Alerting | The `HighErrorRate` condition in `alerts.yml` never becomes true |

Fix all three, then re-run the verification sequence above.
