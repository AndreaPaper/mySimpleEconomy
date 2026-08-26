package com.spesetracker.service;

import com.spesetracker.dto.checkpoint.BalanceCheckpointRequest;
import com.spesetracker.dto.checkpoint.BalanceCheckpointResponse;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class BalanceCheckpointService {

    private final BalanceCheckpointRepository balanceCheckpointRepository;
    private final UserRepository userRepository;

    public List<BalanceCheckpointResponse> list(UUID userId) {
        return balanceCheckpointRepository.findByUserIdOrderByCheckpointDateDesc(userId).stream()
                .map(BalanceCheckpointResponse::from)
                .toList();
    }

    // Crea un nuovo checkpoint, oppure aggiorna il saldo se esiste già per quella data.
    @Transactional
    public BalanceCheckpointResponse upsert(UUID userId, BalanceCheckpointRequest request) {
        BalanceCheckpoint checkpoint = balanceCheckpointRepository
                .findByUserIdAndCheckpointDate(userId, request.checkpointDate())
                .orElseGet(() -> BalanceCheckpoint.builder()
                        .user(userRepository.getReferenceById(userId))
                        .checkpointDate(request.checkpointDate())
                        .build());

        checkpoint.setBalance(request.balance());
        // Chi scrive un saldo a mano sta leggendo il conto adesso: quello che ha
        // gia' registrato oggi e' dentro quel numero e non va sottratto di
        // nuovo, quello che registrera' dopo si'. Si riscrive anche quando si
        // aggiorna un saldo esistente, perche' il momento buono e' l'ultimo.
        checkpoint.setCountsFrom(Instant.now());

        return BalanceCheckpointResponse.from(balanceCheckpointRepository.save(checkpoint));
    }
}
