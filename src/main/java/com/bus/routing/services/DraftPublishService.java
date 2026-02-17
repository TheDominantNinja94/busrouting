package com.bus.routing.services;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bus.routing.models.Route;
import com.bus.routing.models.RouteStop;
import com.bus.routing.repositories.RouteRepository;
import com.bus.routing.repositories.RouteStopRepository;

@Service
public class DraftPublishService {

    private final RouteRepository routeRepository;
    private final RouteStopRepository routeStopRepository;

    public DraftPublishService(RouteRepository routeRepository, RouteStopRepository routeStopRepository) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
    }

    @Transactional
    public Route publishDraftToNewRoute(Long draftRouteId, String newRouteNumber, boolean deleteDraft) {
        Route draft = routeRepository.findById(draftRouteId)
            .orElseThrow(() -> new IllegalArgumentException("Route not found: " + draftRouteId));

        if (!draft.isDraft()) {
            throw new IllegalArgumentException("Only draft routes can be published");
        }

        // Create the new "real" route
        Route newRoute = new Route();
        String name = (newRouteNumber != null && !newRouteNumber.trim().isEmpty())
            ? newRouteNumber.trim()
            : draft.getRouteNumber().replace("-DRAFT", "");

        newRoute.setRouteNumber(name);
        newRoute.setDraft(false);
        newRoute.setSourceRouteId(draft.getSourceRouteId()); // keep lineage if you want
        newRoute = routeRepository.save(newRoute);

        // Copy route-stops in the SAME ORDER as the draft
        List<RouteStop> draftStops = routeStopRepository.findByRouteIdOrderByStopOrderAsc(draftRouteId);

        for (RouteStop ds : draftStops) {
            RouteStop ns = new RouteStop();
            ns.setRoute(newRoute);
            ns.setStop(ds.getStop());
            ns.setStopOrder(ds.getStopOrder());
            ns.setPickupTime(ds.getPickupTime());
            routeStopRepository.save(ns);
        }

        // Optionally delete the draft (and its route-stops)
        if (deleteDraft) {
            routeStopRepository.deleteAll(draftStops);
            routeRepository.delete(draft);
        }

        return newRoute;
    }
}
