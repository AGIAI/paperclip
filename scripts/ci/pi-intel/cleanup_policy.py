"""Prospective private cleanup bounds; source/GO authority is deliberately absent."""
INNER_GRACE_SECONDS = 45
INNER_FORCE_SECONDS = 5
OWNER_GRACE_SECONDS = INNER_GRACE_SECONDS + INNER_FORCE_SECONDS
POSTGRES_GRACE_SECONDS = 20
RESIDUAL_GRACE_SECONDS = 10
KILL_GRACE_SECONDS = 5
INSPECTION_RETRY_SECONDS = 5
STOP_DEADLINE_SECONDS = 100
CLEANUP_ALLOWANCE_SECONDS = 120
LATE_CLOUD_OBSERVATION_SECONDS = 360
CLOUD_REQUEST_ALLOWANCE_SECONDS = 60

def remote_bound(outer_seconds, runs, rates):
    seconds=outer_seconds+CLEANUP_ALLOWANCE_SECONDS+LATE_CLOUD_OBSERVATION_SECONDS+CLOUD_REQUEST_ALLOWANCE_SECONDS
    hourly=4*rates['cpuCoreHourUsd']+4*rates['memoryGiBHourUsd']+10*rates['storageGiBHourUsd']
    return {'billableWindowSeconds':seconds,'maximumSandboxes':runs,'perSandboxUsd':round(hourly*seconds/3600,9),'maximumInfrastructureUsd':round(hourly*seconds/3600*runs,9)}
