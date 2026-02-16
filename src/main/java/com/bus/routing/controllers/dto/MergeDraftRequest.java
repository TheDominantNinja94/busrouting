package com.bus.routing.controllers.dto;


import java.util.List;

public class MergeDraftRequest {
    private Long fromRouteId;
    private List<Long> routeStopIds;
    private String strategy; // "PROXIMITY", "APPEND", etc.

    public Long getFromRouteId() { return fromRouteId; }
    public void setFromRouteId(Long fromRouteId) { this.fromRouteId = fromRouteId; }

    public List<Long> getRouteStopIds() { return routeStopIds; }
    public void setRouteStopIds(List<Long> routeStopIds) { this.routeStopIds = routeStopIds; }

    public String getStrategy() { return strategy; }
    public void setStrategy(String strategy) { this.strategy = strategy; }
}
