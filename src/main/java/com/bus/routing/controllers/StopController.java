package com.bus.routing.controllers;

import org.springframework.web.bind.annotation.*;
import java.util.List;

import com.bus.routing.models.Stop;
import com.bus.routing.repositories.StopRepository;

@RestController
@RequestMapping("/stops")
public class StopController {

    private final StopRepository stopRepository;

    public StopController(StopRepository stopRepository) {
        this.stopRepository = stopRepository;
    }

    @GetMapping
    public List<Stop> getAllStops() {
        return stopRepository.findAll();
    }

    @PostMapping
    public Stop createStop(@RequestBody Stop stop) {
        if (stop == null || stop.getName() == null || stop.getName().isBlank()) {
            throw new IllegalArgumentException("Stop name is required");
        }
        return stopRepository.save(stop);
    }

    @DeleteMapping("/{id}")
    public void deleteStop(@PathVariable Long id) {
        stopRepository.deleteById(id);
    }
}
