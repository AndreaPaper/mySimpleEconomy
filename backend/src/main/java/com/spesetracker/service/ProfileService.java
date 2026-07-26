package com.spesetracker.service;

import com.spesetracker.dto.profile.ProfileResponse;
import com.spesetracker.dto.profile.ProfileUpdateRequest;
import com.spesetracker.model.AvatarCatalog;
import com.spesetracker.model.User;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public ProfileResponse get(UUID userId) {
        return toResponse(findUser(userId));
    }

    @Transactional
    public ProfileResponse update(UUID userId, ProfileUpdateRequest request) {
        User user = findUser(userId);
        user.setNickname(request.nickname());
        user.setDefaultSalaryAmount(request.defaultSalaryAmount());
        user.setSalaryDay(request.salaryDay());
        user.setAvatarKey(validateAvatarKey(request.avatarKey()));
        return toResponse(user);
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utente non trovato"));
    }

    // L'utente può solo scegliere tra gli avatar offerti dall'app (AvatarCatalog),
    // non caricare un'immagine propria: qualsiasi altro valore è rifiutato.
    private String validateAvatarKey(String avatarKey) {
        if (avatarKey == null) return null;
        if (!AvatarCatalog.VALID_KEYS.contains(avatarKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar non valido");
        }
        return avatarKey;
    }

    private ProfileResponse toResponse(User user) {
        return new ProfileResponse(
                user.getEmail(), user.getNickname(), user.getDefaultSalaryAmount(), user.getSalaryDay(), user.getAvatarKey());
    }
}
