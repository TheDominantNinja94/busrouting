package com.bus.routing.repositories;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import com.bus.routing.models.Route;

public interface RouteRepository extends JpaRepository<Route, Long> {
    List<Route> findByDraftFalse();
}

