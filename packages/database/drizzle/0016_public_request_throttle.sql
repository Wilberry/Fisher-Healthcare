-- Public request rate limits keyed only by HMAC of network source in synthetic staging.
CREATE TABLE public_rate_limits(
 network_hash char(64) NOT NULL,
 route varchar(40) NOT NULL CHECK(route IN ('availability','quote','guest-start','guest-verify')),
 window_started_at timestamptz NOT NULL,
 requests integer NOT NULL DEFAULT 1 CHECK(requests>0),
 PRIMARY KEY(network_hash,route,window_started_at)
);
CREATE INDEX public_rate_limit_retention ON public_rate_limits(window_started_at);
