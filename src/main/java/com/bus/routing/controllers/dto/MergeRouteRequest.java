package com.bus.routing.controllers.dto;

import java.util.List;

public class MergeRouteRequest {
    public Long fromRouteId;             // donor route
    public List<Long> routeStopIds;      // selected RouteStop ids from donor route
    public String strategy;              // "PROXIMITY" (optional)
}
