DC = docker compose -f infra/docker-compose.yml
.PHONY: up down seed sim sim-burst test coverage load chaos chaos-proc e2e explain logs ps clean

up:            ## build + start the whole stack (first run pulls images)
	$(DC) up -d --build
seed:          ## 100K vehicles, users, fleets, OEM mappings A-D
	$(DC) run --rm api node scripts/seed.js
	$(DC) restart processor
sim:           ## run the simulator (RATE=2000 VEHICLES=100000 DURATION=0 for forever)
	$(DC) --profile sim run --rm simulator
sim-burst:
	$(DC) --profile sim run --rm simulator node src/simulator/index.js --url http://ingest:4001 --burst
test:
	cd backend && npm test
coverage:
	cd backend && npm run coverage
load:          ## k6 at 100K events/sec (needs k6 installed)
	k6 run infra/k6/ingest.js
chaos:
	bash infra/chaos/kill-broker.sh
chaos-proc:
	bash infra/chaos/kill-processor.sh
e2e:
	bash infra/ci-e2e.sh
explain:
	bash infra/explain.sh
logs:
	$(DC) logs -f --tail 50 ingest processor api
ps:
	$(DC) ps
down:
	$(DC) down
clean:
	$(DC) down -v
