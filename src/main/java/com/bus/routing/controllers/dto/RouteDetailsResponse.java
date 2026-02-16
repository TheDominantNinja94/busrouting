package com.bus.routing.controllers.dto;

import java.util.List;

public class RouteDetailsResponse {
    public Long routeId;
    public String routeNumber;
    public boolean draft;
    public Long sourceRouteId;
    public List<StopOnRoute> stops;

    public static class StopOnRoute {
        public Long routeStopId;
        public Long stopId;
        public Integer stopOrder;
        public String pickupTime;
        public String name;
        public Double latitude;
        public Double longitude;
    }
}
