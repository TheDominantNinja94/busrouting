package com.bus.routing.controllers;

import org.springframework.web.bind.annotation.*;
import java.util.List;

import com.bus.routing.models.Route;
import com.bus.routing.models.RouteStop;
import com.bus.routing.repositories.RouteRepository;
import com.bus.routing.repositories.RouteStopRepository;
import com.bus.routing.controllers.dto.RouteDetailsResponse;

@RestController
@RequestMapping("/routes")
public class RouteController {

    private final RouteRepository routeRepository;
    private final RouteStopRepository routeStopRepository;

    public RouteController(RouteRepository routeRepository, RouteStopRepository routeStopRepository) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
    }

    @GetMapping
    public List<Route> getAllRoutes() {
        return routeRepository.findAll();
    }

    @PostMapping
    public Route createRoute(@RequestBody Route route) {
        if (route == null) {
            throw new IllegalArgumentException("Route body cannot be null");
        }
        return routeRepository.save(route);
    }

    @DeleteMapping("/{id}")
    public void deleteRoute(@PathVariable Long id) {
        routeRepository.deleteById(id);
    }

    @GetMapping("/{routeId}/details")
    public RouteDetailsResponse getRouteDetails(@PathVariable long routeId) {

        Route route = routeRepository.findById(routeId)
                .orElseThrow(() -> new IllegalArgumentException("Route not found: " + routeId));

        List<RouteStop> routeStops =
                routeStopRepository.findByRouteIdOrderByStopOrderAsc(routeId);

        RouteDetailsResponse response = new RouteDetailsResponse();
        response.routeId = route.getId();
        response.routeNumber = route.getRouteNumber();

        response.stops = routeStops.stream().map(rs -> {
    RouteDetailsResponse.StopOnRoute s = new RouteDetailsResponse.StopOnRoute();

    s.routeStopId = rs.getId();
    s.stopOrder = rs.getStopOrder();
    s.stopId = rs.getStop().getId();
    s.name = rs.getStop().getName();
    s.latitude = rs.getStop().getLatitude();
    s.longitude = rs.getStop().getLongitude();
    s.pickupTime = rs.getPickupTime();

    return s;
}).toList();


        return response;
    }
}
