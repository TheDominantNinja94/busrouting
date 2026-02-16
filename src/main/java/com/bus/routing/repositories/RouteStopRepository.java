package com.bus.routing.repositories;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import com.bus.routing.models.RouteStop;

public interface RouteStopRepository extends JpaRepository<RouteStop, Long> {
    List<RouteStop> findByRouteIdOrderByStopOrderAsc(Long routeId);
    List<RouteStop> findByIdIn(Collection<Long> ids);
    List<RouteStop> findByRouteId(Long routeId);
    void deleteByRouteId(Long routeId);
}
