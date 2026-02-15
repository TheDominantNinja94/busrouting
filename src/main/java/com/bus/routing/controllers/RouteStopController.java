package com.bus.routing.controllers;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.bus.routing.controllers.dto.AddStopToRouteRequest;
import com.bus.routing.models.Route;
import com.bus.routing.models.RouteStop;
import com.bus.routing.models.Stop;
import com.bus.routing.repositories.RouteRepository;
import com.bus.routing.repositories.RouteStopRepository;
import com.bus.routing.repositories.StopRepository;
import com.bus.routing.controllers.dto.UpdateRouteStopRequest;


@RestController
@RequestMapping("/route-stops")
public class RouteStopController {

    private final RouteStopRepository routeStopRepository;
    private final RouteRepository routeRepository;
    private final StopRepository stopRepository;

    public RouteStopController(
            RouteStopRepository routeStopRepository,
            RouteRepository routeRepository,
            StopRepository stopRepository) {
        this.routeStopRepository = routeStopRepository;
        this.routeRepository = routeRepository;
        this.stopRepository = stopRepository;
    }

    @GetMapping("/route/{routeId}")
    public List<RouteStop> getStopsForRoute(@PathVariable Long routeId) {
        return routeStopRepository.findByRouteIdOrderByStopOrderAsc(routeId);
    }

    @PostMapping
    public RouteStop addStopToRoute(@RequestBody AddStopToRouteRequest req) {

        if (req == null || req.routeId == null || req.stopId == null) {
            throw new IllegalArgumentException("routeId and stopId are required");
        }

        if (req.pickupTime == null || req.pickupTime.isBlank()) {
            throw new IllegalArgumentException("pickupTime is required");
        }

        Route route = routeRepository.findById(req.routeId)
                .orElseThrow(() -> new IllegalArgumentException("Route not found: " + req.routeId));

        Stop stop = stopRepository.findById(req.stopId)
                .orElseThrow(() -> new IllegalArgumentException("Stop not found: " + req.stopId));

        RouteStop rs = new RouteStop();
        rs.setRoute(route);
        rs.setStop(stop);
        rs.setStopOrder(req.stopOrder);
        rs.setPickupTime(req.pickupTime);

        return routeStopRepository.save(rs);
    }

    @DeleteMapping("/{id}")
    public void deleteRouteStop(@PathVariable Long id) {
        routeStopRepository.deleteById(id);
    }
    @PatchMapping("/{id}")
public RouteStop updateRouteStop(@PathVariable Long id, @RequestBody UpdateRouteStopRequest req) {

    RouteStop rs = routeStopRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("RouteStop not found: " + id));

    if (req.stopOrder != null) {
        rs.setStopOrder(req.stopOrder);
    }

    if (req.pickupTime != null) {
        rs.setPickupTime(req.pickupTime);
    }

    return routeStopRepository.save(rs);
}

}
