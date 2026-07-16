package com.spesetracker.controller;

import com.spesetracker.dto.profile.ProfileResponse;
import com.spesetracker.dto.profile.ProfileUpdateRequest;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.ProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;

    @GetMapping
    public ProfileResponse get(@AuthenticationPrincipal UserPrincipal principal) {
        return profileService.get(principal.getId());
    }

    @PutMapping
    public ProfileResponse update(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ProfileUpdateRequest request
    ) {
        return profileService.update(principal.getId(), request);
    }
}
