package com.bus.routing.models;
import jakarta.persistence.*;

@Entity
public class Route {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String routeNumber;

    public Long getId() { return id; }

    public String getRouteNumber() { return routeNumber; }

    public void setRouteNumber(String routeNumber) {
        this.routeNumber = routeNumber;
    }
}
