package com.bus.routing.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import com.bus.routing.models.Stop;

public interface StopRepository extends JpaRepository<Stop, Long> {
}
