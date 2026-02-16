package com.bus.routing.services;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bus.routing.models.Route;
import com.bus.routing.models.RouteStop;
import com.bus.routing.models.Stop;
import com.bus.routing.repositories.RouteRepository;
import com.bus.routing.repositories.RouteStopRepository;

@Service
public class RouteMergeService {

    private final RouteRepository routeRepository;
    private final RouteStopRepository routeStopRepository;

    public RouteMergeService(RouteRepository routeRepository, RouteStopRepository routeStopRepository) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
    }

@Transactional
public Route mergeIntoDraftRoute(Long baseRouteId, Long donorRouteId, List<Long> donorRouteStopIds) {

    if (baseRouteId == null || donorRouteId == null) {
        throw new IllegalArgumentException("baseRouteId and donorRouteId are required");
    }
    if (donorRouteStopIds == null || donorRouteStopIds.isEmpty()) {
        throw new IllegalArgumentException("donorRouteStopIds must have at least 1 item");
    }
    if (baseRouteId.equals(donorRouteId)) {
        throw new IllegalArgumentException("donorRouteId cannot equal baseRouteId");
    }

    Route baseRoute = routeRepository.findById(baseRouteId)
            .orElseThrow(() -> new IllegalArgumentException("Base route not found: " + baseRouteId));

    // Base route stops (current order)
    List<RouteStop> baseStops = routeStopRepository.findByRouteIdOrderByStopOrderAsc(baseRouteId);

    // Donor selected stops (validate they belong to donor route)
    List<RouteStop> donorSelected = routeStopRepository.findByIdIn(donorRouteStopIds);
    for (RouteStop rs : donorSelected) {
        if (rs.getRoute() == null || rs.getRoute().getId() == null || !rs.getRoute().getId().equals(donorRouteId)) {
            throw new IllegalArgumentException("RouteStop id " + rs.getId() + " does not belong to donor route " + donorRouteId);
        }
    }

    // Avoid duplicates: don’t add donor stops whose Stop already exists in base
    Set<Long> baseStopIds = new HashSet<>();
    for (RouteStop rs : baseStops) {
        if (rs.getStop() != null && rs.getStop().getId() != null) {
            baseStopIds.add(rs.getStop().getId());
        }
    }

    List<RouteStop> donorToAdd = new ArrayList<>();
    for (RouteStop rs : donorSelected) {
        Long stopId = rs.getStop() != null ? rs.getStop().getId() : null;
        if (stopId != null && !baseStopIds.contains(stopId)) {
            donorToAdd.add(rs);
        }
    }

    // Preserve base pickup times by StopId
    Map<Long, String> basePickupByStopId = new HashMap<>();
    for (RouteStop rs : baseStops) {
        if (rs.getStop() != null && rs.getStop().getId() != null) {
            basePickupByStopId.put(rs.getStop().getId(), rs.getPickupTime());
        }
    }

    // Build combined stop list
    List<Stop> combinedStops = new ArrayList<>();
    for (RouteStop rs : baseStops) combinedStops.add(rs.getStop());
    for (RouteStop rs : donorToAdd) combinedStops.add(rs.getStop());

    // Reorder by proximity (same logic you already have)
    List<Stop> ordered = orderByProximity(combinedStops);

    // ✅ NEW PART: Create a DRAFT route instead of overwriting base
    Route draft = new Route();
    draft.setRouteNumber(baseRoute.getRouteNumber() + "-DRAFT");
    draft.setDraft(true);
    draft.setSourceRouteId(baseRoute.getId());
    draft = routeRepository.save(draft);

    // Create RouteStops for the DRAFT route
    int order = 1;
    for (Stop stop : ordered) {
        RouteStop newRs = new RouteStop();
        newRs.setRoute(draft);
        newRs.setStop(stop);
        newRs.setStopOrder(order++);

        // Keep pickupTime if it existed on base route; otherwise null
        if (stop != null && stop.getId() != null && basePickupByStopId.containsKey(stop.getId())) {
            newRs.setPickupTime(basePickupByStopId.get(stop.getId()));
        } else {
            newRs.setPickupTime(null);
        }

        routeStopRepository.save(newRs);
    }

    // Return the draft route (controller can call /details on it)
    return draft;
}

@Transactional
public void deleteDraftRoute(Long routeId) {
    Route route = routeRepository.findById(routeId)
            .orElseThrow(() -> new IllegalArgumentException("Route not found: " + routeId));

    if (!route.isDraft()) {
        throw new IllegalArgumentException("Only draft routes can be deleted");
    }

    List<RouteStop> stops = routeStopRepository.findByRouteIdOrderByStopOrderAsc(routeId);
    routeStopRepository.deleteAll(stops);

    routeRepository.delete(route);
}

    private List<Stop> orderByProximity(List<Stop> stops) {
        List<Stop> remaining = new ArrayList<>();
        for (Stop s : stops) {
            if (s != null) remaining.add(s);
        }

        if (remaining.size() <= 1) return remaining;

        // Start from the first stop in the list (base route’s first stop)
        Stop current = remaining.remove(0);
        List<Stop> result = new ArrayList<>();
        result.add(current);

        while (!remaining.isEmpty()) {
            int bestIndex = 0;
            double bestDist = dist(current, remaining.get(0));

            for (int i = 1; i < remaining.size(); i++) {
                double d = dist(current, remaining.get(i));
                if (d < bestDist) {
                    bestDist = d;
                    bestIndex = i;
                }
            }

            current = remaining.remove(bestIndex);
            result.add(current);
        }

        return result;
    }

    // simple distance on lat/lon (good enough for local proximity ordering)
    private double dist(Stop a, Stop b) {
        double dx = a.getLatitude() - b.getLatitude();
        double dy = a.getLongitude() - b.getLongitude();
        return (dx * dx) + (dy * dy);
    }
}
