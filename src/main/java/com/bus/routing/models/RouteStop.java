package com.bus.routing.models;

import jakarta.persistence.*;

@Entity
public class RouteStop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    private Route route;

    @ManyToOne
    private Stop stop;

    private int stopOrder;

    public Long getId() { return id; }

    public Route getRoute() { return route; }
    public void setRoute(Route route) { this.route = route; }

    public Stop getStop() { return stop; }
    public void setStop(Stop stop) { this.stop = stop; }

    public int getStopOrder() { return stopOrder; }
    public void setStopOrder(int stopOrder) { this.stopOrder = stopOrder; }
    
    private String pickupTime;
    public String getPickupTime() { return pickupTime; }
    public void setPickupTime(String pickupTime) { this.pickupTime = pickupTime; }


}
