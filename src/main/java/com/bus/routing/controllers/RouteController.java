package com.bus.routing.controllers;

import org.springframework.web.bind.annotation.*;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.bus.routing.controllers.dto.MergeRouteRequest;
import com.bus.routing.controllers.dto.RenameRouteRequest;
import com.bus.routing.controllers.dto.RouteDetailsResponse;
import com.bus.routing.controllers.dto.PublishDraftRequest;

import com.bus.routing.models.Route;
import com.bus.routing.models.RouteStop;

import com.bus.routing.repositories.RouteRepository;
import com.bus.routing.repositories.RouteStopRepository;

import com.bus.routing.services.RouteMergeService;
import com.bus.routing.services.DraftPublishService;



@RestController
@RequestMapping("/routes")
public class RouteController {

    private final RouteRepository routeRepository;
    private final RouteStopRepository routeStopRepository;
    private final RouteMergeService routeMergeService;
    private final DraftPublishService draftPublishService;

    public RouteController(
            RouteRepository routeRepository,
            RouteStopRepository routeStopRepository,
            RouteMergeService routeMergeService,
            DraftPublishService draftPublishService
    ) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
        this.routeMergeService = routeMergeService;
        this.draftPublishService = draftPublishService;
    }


// Show routes. By default excludes drafts, but you can include them with ?includeDrafts=true
@GetMapping
public List<Route> getAllRoutes(@RequestParam(defaultValue = "false") boolean includeDrafts) {
    if (includeDrafts) {
        return routeRepository.findAll();
    }
    return routeRepository.findByDraftFalse();
}


    @PostMapping
    public Route createRoute(@RequestBody Route route) {
        if (route == null) {
            throw new IllegalArgumentException("Route body cannot be null");
        }
        // Optional safety: prevent creating drafts via normal route creation
        if (route.isDraft()) {
            throw new IllegalArgumentException("Cannot create a draft route via POST /routes");
        }
        return routeRepository.save(route);
    }

    @DeleteMapping("/{id}")
    public void deleteRoute(@PathVariable Long id) {
    Route route = routeRepository.findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Route not found: " + id));

    // delete stops first to avoid FK issues
    List<RouteStop> stops = routeStopRepository.findByRouteIdOrderByStopOrderAsc(id);
    routeStopRepository.deleteAll(stops);

    routeRepository.delete(route);
}


    @GetMapping("/{routeId}/details")
    public RouteDetailsResponse getRouteDetails(@PathVariable Long routeId) {

        Route route = routeRepository.findById(routeId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Route not found: " + routeId));


        List<RouteStop> routeStops = routeStopRepository.findByRouteIdOrderByStopOrderAsc(routeId);

        RouteDetailsResponse response = new RouteDetailsResponse();
        response.routeId = route.getId();
        response.routeNumber = route.getRouteNumber();
        response.draft = route.isDraft();
        response.sourceRouteId = route.getSourceRouteId();

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

    // Non-destructive merge: creates a draft route
    @PostMapping("/{baseRouteId}/merge")
    public RouteDetailsResponse mergeRoute(@PathVariable Long baseRouteId, @RequestBody MergeRouteRequest req) {

        if (req == null || req.fromRouteId == null || req.routeStopIds == null || req.routeStopIds.isEmpty()) {
            throw new IllegalArgumentException("fromRouteId and routeStopIds are required");
        }

        Route draft = routeMergeService.mergeIntoDraftRoute(baseRouteId, req.fromRouteId, req.routeStopIds);

        return getRouteDetails(draft.getId());
    }

    // Delete draft route safely
    @DeleteMapping("/{routeId}/draft")
    public void deleteDraft(@PathVariable Long routeId) {
        routeMergeService.deleteDraftRoute(routeId);
    }
    @PatchMapping("/{routeId}")
public Route renameRoute(@PathVariable Long routeId, @RequestBody RenameRouteRequest req) {
    if (req == null || req.routeNumber == null || req.routeNumber.trim().isEmpty()) {
        throw new IllegalArgumentException("routeNumber is required");
    }

    Route route = routeRepository.findById(routeId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Route not found: " + routeId));

    route.setRouteNumber(req.routeNumber.trim());
    return routeRepository.save(route);
}

@PostMapping("/{draftRouteId}/publish")
public RouteDetailsResponse publishDraft(
        @PathVariable Long draftRouteId,
        @RequestBody(required = false) PublishDraftRequest req
) {
    String newName = (req != null) ? req.routeNumber : null;
    boolean deleteDraft = (req == null) ? true : req.deleteDraft;

    Route newRoute = draftPublishService.publishDraftToNewRoute(draftRouteId, newName, deleteDraft);
    return getRouteDetails(newRoute.getId());
}


}
