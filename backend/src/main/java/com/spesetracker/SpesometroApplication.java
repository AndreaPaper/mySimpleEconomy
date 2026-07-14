package com.spesetracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SpesometroApplication {

	public static void main(String[] args) {
		SpringApplication.run(SpesometroApplication.class, args);
	}

}
