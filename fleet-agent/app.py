"""
Fleet Agent - Docker monitoring sidecar for Fleet Dashboard.
Proxies Docker socket and exposes REST API for container info, logs, stats, DB sizes.
"""

import json
import os
import re
import time
import hmac
import threading
from functools import wraps
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, jsonify, request

import docker

FLEET_SECRET = os.environ.get("FLEET_AGENT_SECRET", "")


def require_auth(fn):
    """Validate X-Fleet-Secret header on all API routes."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not FLEET_SECRET:
            # No secret configured — reject all requests (fail-closed)
            return jsonify({"error": "FLEET_AGENT_SECRET not configured"}), 503
        token = request.headers.get("X-Fleet-Secret", "")
        if not token or not hmac.compare_digest(token, FLEET_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


def _validate_pg_user(user: str) -> str:
    """Validate PostgreSQL username to prevent command injection."""
    if not re.match(r'^[a-zA-Z0-9_]+$', user):
        raise ValueError(f"Invalid PostgreSQL username: {user}")
    return user

app = Flask(__name__)
client = docker.from_env()

# Simple in-memory cache
_cache = {}
_cache_lock = threading.Lock()


def cached(key: str, ttl: int):
    """Simple TTL cache decorator."""
    def decorator(fn):
        def wrapper(*args, **kwargs):
            now = time.time()
            with _cache_lock:
                if key in _cache and now - _cache[key]["ts"] < ttl:
                    return _cache[key]["data"]
            result = fn(*args, **kwargs)
            with _cache_lock:
                _cache[key] = {"data": result, "ts": now}
            return result
        wrapper.__name__ = fn.__name__
        return wrapper
    return decorator


@app.route("/health")
def health():
    try:
        client.ping()
        return jsonify({"status": "healthy", "service": "fleet-agent"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 503


@app.route("/api/containers")
@require_auth
@cached("containers", 30)
def list_containers():
    containers = client.containers.list(all=True)
    result = []
    for c in containers:
        # Safely get image name — c.image can throw if image was deleted
        try:
            img = c.image
            image_name = str(img.tags[0]) if img.tags else str(img.short_id)
        except Exception:
            image_name = c.attrs.get("Config", {}).get("Image", "unknown")

        info = {
            "id": c.short_id,
            "name": c.name,
            "image": image_name,
            "status": c.status,
            "state": c.attrs.get("State", {}).get("Health", {}).get("Status", c.status),
            "created": c.attrs.get("Created", ""),
            "ports": _parse_ports(c.attrs.get("NetworkSettings", {}).get("Ports", {})),
            "labels": c.labels,
        }
        # Get uptime from StartedAt
        state = c.attrs.get("State", {})
        info["started_at"] = state.get("StartedAt", "")
        info["finished_at"] = state.get("FinishedAt", "")

        result.append(info)

    return jsonify(result)


def _parse_ports(ports_dict):
    """Parse Docker port bindings into readable format."""
    parsed = []
    if not ports_dict:
        return parsed
    for container_port, bindings in ports_dict.items():
        if bindings:
            for b in bindings:
                parsed.append(f"{b.get('HostIp', '')}:{b.get('HostPort', '')} -> {container_port}")
        else:
            parsed.append(container_port)
    return parsed


@app.route("/api/containers/<name>/logs")
@require_auth
def container_logs(name):
    lines = request.args.get("lines", 50, type=int)
    lines = min(lines, 500)  # Cap at 500
    try:
        container = client.containers.get(name)
        logs = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        return jsonify({
            "name": name,
            "lines": lines,
            "logs": logs,
        })
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {name} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/containers/<name>/stats")
@require_auth
def container_stats(name):
    cache_key = f"stats_{name}"
    now = time.time()
    with _cache_lock:
        if cache_key in _cache and now - _cache[cache_key]["ts"] < 30:
            return jsonify(_cache[cache_key]["data"])

    try:
        container = client.containers.get(name)
        if container.status != "running":
            return jsonify({
                "name": name,
                "status": container.status,
                "cpu_percent": 0,
                "memory_usage_mb": 0,
                "memory_limit_mb": 0,
                "memory_percent": 0,
            })

        stats = container.stats(stream=False)
        cpu = _calc_cpu(stats)
        mem = _calc_memory(stats)

        result = {
            "name": name,
            "status": "running",
            "cpu_percent": round(cpu, 2),
            "memory_usage_mb": round(mem["usage"] / (1024 * 1024), 1),
            "memory_limit_mb": round(mem["limit"] / (1024 * 1024), 1),
            "memory_percent": round(mem["percent"], 2),
            "network_rx_mb": round(mem.get("net_rx", 0) / (1024 * 1024), 1),
            "network_tx_mb": round(mem.get("net_tx", 0) / (1024 * 1024), 1),
        }

        with _cache_lock:
            _cache[cache_key] = {"data": result, "ts": now}

        return jsonify(result)
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {name} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _calc_cpu(stats):
    """Calculate CPU percentage from Docker stats."""
    try:
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})

        cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - \
                    precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        system_delta = cpu_stats.get("system_cpu_usage", 0) - \
                       precpu_stats.get("system_cpu_usage", 0)

        online_cpus = cpu_stats.get("online_cpus", 1)

        if system_delta > 0 and cpu_delta > 0:
            return (cpu_delta / system_delta) * online_cpus * 100.0
    except (KeyError, ZeroDivisionError):
        pass
    return 0.0


def _calc_memory(stats):
    """Calculate memory usage from Docker stats."""
    try:
        mem = stats.get("memory_stats", {})
        usage = mem.get("usage", 0) - mem.get("stats", {}).get("cache", 0)
        limit = mem.get("limit", 1)
        percent = (usage / limit) * 100 if limit > 0 else 0

        net_rx = 0
        net_tx = 0
        networks = stats.get("networks", {})
        for iface in networks.values():
            net_rx += iface.get("rx_bytes", 0)
            net_tx += iface.get("tx_bytes", 0)

        return {"usage": max(0, usage), "limit": limit, "percent": percent,
                "net_rx": net_rx, "net_tx": net_tx}
    except (KeyError, ZeroDivisionError):
        return {"usage": 0, "limit": 0, "percent": 0, "net_rx": 0, "net_tx": 0}


@app.route("/api/stats/batch")
@require_auth
def batch_stats():
    """Fetch stats for all running containers in one request (parallelized)."""
    cache_key = "batch_stats"
    now = time.time()
    with _cache_lock:
        if cache_key in _cache and now - _cache[cache_key]["ts"] < 30:
            return jsonify(_cache[cache_key]["data"])

    containers = client.containers.list(filters={"status": "running"})

    def get_stats(c):
        try:
            stats = c.stats(stream=False)
            cpu = _calc_cpu(stats)
            mem = _calc_memory(stats)
            return {
                "name": c.name,
                "status": "running",
                "cpu_percent": round(cpu, 2),
                "memory_usage_mb": round(mem["usage"] / (1024 * 1024), 1),
                "memory_limit_mb": round(mem["limit"] / (1024 * 1024), 1),
                "memory_percent": round(mem["percent"], 2),
                "network_rx_mb": round(mem.get("net_rx", 0) / (1024 * 1024), 1),
                "network_tx_mb": round(mem.get("net_tx", 0) / (1024 * 1024), 1),
            }
        except Exception:
            return None

    results = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(get_stats, c): c for c in containers}
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    with _cache_lock:
        _cache[cache_key] = {"data": results, "ts": now}

    return jsonify(results)


@app.route("/api/postgres/<container_name>/db-size")
@require_auth
def postgres_db_size(container_name):
    if not re.match(r'^[a-zA-Z0-9_\-\.]+$', container_name):
        return jsonify({"error": "Invalid container name"}), 400

    cache_key = f"dbsize_{container_name}"
    now = time.time()
    with _cache_lock:
        if cache_key in _cache and now - _cache[cache_key]["ts"] < 30:
            return jsonify(_cache[cache_key]["data"])

    try:
        container = client.containers.get(container_name)
        if container.status != "running":
            return jsonify({"error": "Container not running"}), 400

        # Extract postgres user from env
        pg_user = "postgres"
        env_list = container.attrs.get("Config", {}).get("Env", [])
        for env in env_list:
            if env.startswith("POSTGRES_USER="):
                pg_user = _validate_pg_user(env.split("=", 1)[1])
                break

        # -d postgres: that database always exists; without -d psql picks a database
        # named after the user, which fails when POSTGRES_DB differs from POSTGRES_USER.
        cmd = ["psql", "-U", pg_user, "-d", "postgres", "-t", "-A", "-c",
               "SELECT datname, pg_database_size(datname) FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC;"]
        exit_code, output = container.exec_run(cmd)

        if exit_code != 0:
            return jsonify({"error": f"psql failed: {output.decode()}"}), 500

        databases = []
        for line in output.decode().strip().split("\n"):
            if "|" in line:
                parts = line.split("|")
                name = parts[0].strip()
                size_bytes = int(parts[1].strip())
                databases.append({
                    "name": name,
                    "size_bytes": size_bytes,
                    "size_mb": round(size_bytes / (1024 * 1024), 1),
                })

        result = {"container": container_name, "databases": databases}

        with _cache_lock:
            _cache[cache_key] = {"data": result, "ts": now}

        return jsonify(result)
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {container_name} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/system")
@require_auth
@cached("system", 60)
def system_info():
    try:
        info = client.info()

        result = {
            "docker_version": info.get("ServerVersion", "unknown"),
            "os": info.get("OperatingSystem", "unknown"),
            "kernel": info.get("KernelVersion", "unknown"),
            "cpus": info.get("NCPU", 0),
            "memory_gb": round(info.get("MemTotal", 0) / (1024**3), 1),
            "containers_total": info.get("Containers", 0),
            "containers_running": info.get("ContainersRunning", 0),
            "containers_stopped": info.get("ContainersStopped", 0),
            "images_total": info.get("Images", 0),
            "disk_usage": {
                "images_gb": 0,
                "containers_gb": 0,
                "volumes_gb": 0,
                "total_gb": 0,
            },
        }

        # df() can be very slow on large systems — try with timeout
        try:
            df = client.df()
            images_size = sum(img.get("Size", 0) for img in df.get("Images", []))
            containers_size = sum(c.get("SizeRw", 0) for c in df.get("Containers", []))
            volumes_size = sum(v.get("UsageData", {}).get("Size", 0) for v in df.get("Volumes", []))
            result["disk_usage"] = {
                "images_gb": round(images_size / (1024**3), 2),
                "containers_gb": round(containers_size / (1024**3), 2),
                "volumes_gb": round(volumes_size / (1024**3), 2),
                "total_gb": round((images_size + containers_size + volumes_size) / (1024**3), 2),
            }
        except Exception:
            pass  # Return basic info without disk usage

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/containers/<name>/restart", methods=["POST"])
@require_auth
def restart_container(name):
    """Restart a specific container."""
    if not re.match(r'^[a-zA-Z0-9_\-\.]+$', name):
        return jsonify({"error": "Invalid container name"}), 400
    try:
        container = client.containers.get(name)
        container.restart(timeout=10)  # Docker default; 30 s made a stubborn container take ~31 s
        return jsonify({"success": True, "container": name, "action": "restart"})
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {name} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/containers/<name>/rebuild", methods=["POST"])
@require_auth
def rebuild_container(name):
    """Rebuild a container (stop, remove, recreate). Requires compose project label."""
    if not re.match(r'^[a-zA-Z0-9_\-\.]+$', name):
        return jsonify({"error": "Invalid container name"}), 400
    try:
        container = client.containers.get(name)
        project = container.labels.get("com.docker.compose.project", "")
        service = container.labels.get("com.docker.compose.service", "")
        if not project or not service:
            return jsonify({"error": "Container not managed by docker compose"}), 400

        # Restart is the safest rebuild action we can do from the agent
        container.restart(timeout=10)  # Docker default; 30 s made a stubborn container take ~31 s
        return jsonify({
            "success": True,
            "container": name,
            "action": "rebuild",
            "note": "Container restarted. For full rebuild, use docker compose up -d --build."
        })
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {name} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/containers/<name>/pull", methods=["POST"])
@require_auth
def pull_container_image(name):
    """Pull latest image for a container."""
    if not re.match(r'^[a-zA-Z0-9_\-\.]+$', name):
        return jsonify({"error": "Invalid container name"}), 400
    try:
        container = client.containers.get(name)
        image_name = container.attrs.get("Config", {}).get("Image", "")
        if not image_name:
            return jsonify({"error": "Could not determine image name"}), 400

        # Pull the image
        pulled = client.images.pull(image_name)
        return jsonify({
            "success": True,
            "container": name,
            "image": image_name,
            "action": "pull",
            "pulled_id": pulled.short_id if hasattr(pulled, 'short_id') else str(pulled)
        })
    except docker.errors.NotFound:
        return jsonify({"error": f"Container {name} not found"}), 404
    except docker.errors.APIError as e:
        return jsonify({"error": f"Pull failed: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
