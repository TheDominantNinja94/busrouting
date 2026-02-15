package com.bus.routing.controllers.dto;

import java.util.List;

public class RouteDetailsResponse {
    public Long routeId;
    public String routeNumber;
    public List<StopOnRoute> stops;

    public static class StopOnRoute {
        public int stopOrder;
        public Long stopId;
        public String name;
        public double latitude;
        public double longitude;
        public String pickupTime;
        public Long routeStopId;
    }
}
