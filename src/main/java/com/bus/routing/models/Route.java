package com.bus.routing.models;

import jakarta.persistence.*;

@Entity
@Table(name = "route") // keep this matching your real table name
public class Route {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String routeNumber;

    @Column(name = "is_draft", nullable = false)
    private boolean draft = false;

    @Column(name = "source_route_id")
    private Long sourceRouteId;

    public Long getId() {
        return id;
    }

    public String getRouteNumber() {
        return routeNumber;
    }

    public void setRouteNumber(String routeNumber) {
        this.routeNumber = routeNumber;
    }

    public boolean isDraft() {
        return draft;
    }

    public void setDraft(boolean draft) {
        this.draft = draft;
    }

    public Long getSourceRouteId() {
        return sourceRouteId;
    }

    public void setSourceRouteId(Long sourceRouteId) {
        this.sourceRouteId = sourceRouteId;
    }
}
