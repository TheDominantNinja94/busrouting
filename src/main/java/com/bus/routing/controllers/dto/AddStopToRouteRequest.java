package com.bus.routing.controllers.dto;

public class AddStopToRouteRequest {
    public Long routeId;
    public Long stopId;
    public int stopOrder;
    public String pickupTime;
}
